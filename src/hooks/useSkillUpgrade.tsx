import { supabase } from '@/integrations/supabase/client';
import type { StructuredSkill } from '@/types/database';
import type { Json } from '@/integrations/supabase/types';

/**
 * After evaluation is marked complete, upgrade candidate structured_skills
 * based on assessment section performance + section skill_tags.
 */
export async function upgradeSkillsFromAssessment(candidateAssessmentId: string) {
  try {
    // 1. Get candidate assessment with candidate info
    const { data: ca, error: caErr } = await supabase
      .from('candidate_assessments')
      .select(`
        candidate_id,
        assessment_id,
        percentage,
        passed,
        candidate:candidates(id, structured_skills)
      `)
      .eq('id', candidateAssessmentId)
      .single();

    if (caErr || !ca) return;

    // 2. Get sections with skill_tags and their questions' scores
    const { data: sections, error: secErr } = await supabase
      .from('assessment_sections')
      .select('id, title, skill_tags')
      .eq('assessment_id', ca.assessment_id);

    if (secErr || !sections) return;

    // Filter sections that have skill_tags
    const taggedSections = sections.filter(
      s => s.skill_tags && Array.isArray(s.skill_tags) && (s.skill_tags as string[]).length > 0
    );

    if (taggedSections.length === 0) return;

    // 3. Get responses for this assessment grouped by section
    const { data: responses, error: respErr } = await supabase
      .from('candidate_responses')
      .select(`
        question_id,
        final_score,
        question:questions(section_id, marks)
      `)
      .eq('candidate_assessment_id', candidateAssessmentId);

    if (respErr || !responses) return;

    // 4. Calculate per-section performance
    const sectionScores: Record<string, { earned: number; total: number }> = {};
    for (const resp of responses) {
      const question = resp.question as any;
      if (!question?.section_id) continue;
      if (!sectionScores[question.section_id]) {
        sectionScores[question.section_id] = { earned: 0, total: 0 };
      }
      sectionScores[question.section_id].earned += resp.final_score || 0;
      sectionScores[question.section_id].total += question.marks || 0;
    }

    // 5. Map section performance to skills
    const skillUpgrades: Record<string, { proficiency: StructuredSkill['proficiency']; confidence: number }> = {};

    for (const section of taggedSections) {
      const sectionPerf = sectionScores[section.id];
      if (!sectionPerf || sectionPerf.total === 0) continue;

      const percentage = (sectionPerf.earned / sectionPerf.total) * 100;
      const skillTags = section.skill_tags as string[];

      let proficiency: StructuredSkill['proficiency'];
      let confidence: number;

      if (percentage >= 80) {
        proficiency = 'expert';
        confidence = 0.9 + (percentage - 80) / 200; // 0.9-1.0
      } else if (percentage >= 50) {
        proficiency = 'intermediate';
        confidence = 0.7 + (percentage - 50) / 200; // 0.7-0.85
      } else {
        proficiency = 'beginner';
        confidence = 0.6; // Real data = higher confidence than AI guess
      }

      for (const skillName of skillTags) {
        const existing = skillUpgrades[skillName.toLowerCase()];
        // Keep the higher proficiency
        if (!existing || confidence > existing.confidence) {
          skillUpgrades[skillName.toLowerCase()] = { proficiency, confidence };
        }
      }
    }

    if (Object.keys(skillUpgrades).length === 0) return;

    // 6. Merge with existing structured_skills
    const candidateData = ca.candidate as any;
    const existingSkills: StructuredSkill[] = Array.isArray(candidateData?.structured_skills)
      ? candidateData.structured_skills
      : [];

    const skillsMap = new Map<string, StructuredSkill>();
    for (const skill of existingSkills) {
      skillsMap.set(skill.name.toLowerCase(), skill);
    }

    // Apply assessment upgrades
    for (const [skillKey, upgrade] of Object.entries(skillUpgrades)) {
      const existing = skillsMap.get(skillKey);
      if (existing) {
        // Upgrade proficiency if assessment shows higher
        const profOrder = { beginner: 0, intermediate: 1, expert: 2 };
        if (profOrder[upgrade.proficiency] >= profOrder[existing.proficiency]) {
          skillsMap.set(skillKey, {
            ...existing,
            proficiency: upgrade.proficiency,
            confidence: Math.max(existing.confidence, upgrade.confidence),
            sources: [...new Set([...existing.sources, 'assessment' as const])],
          });
        } else {
          // Just add assessment source
          skillsMap.set(skillKey, {
            ...existing,
            sources: [...new Set([...existing.sources, 'assessment' as const])],
          });
        }
      } else {
        // New skill discovered through assessment
        skillsMap.set(skillKey, {
          name: skillKey.charAt(0).toUpperCase() + skillKey.slice(1),
          category: 'other',
          proficiency: upgrade.proficiency,
          confidence: upgrade.confidence,
          sources: ['assessment'],
        });
      }
    }

    const updatedSkills = Array.from(skillsMap.values());

    // 7. Update candidate
    await supabase
      .from('candidates')
      .update({ structured_skills: updatedSkills as unknown as Json })
      .eq('id', ca.candidate_id);

  } catch (err) {
    console.error('Failed to upgrade skills from assessment:', err);
  }
}
