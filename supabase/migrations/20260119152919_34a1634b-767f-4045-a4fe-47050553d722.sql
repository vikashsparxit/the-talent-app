-- Create assessment_templates table
CREATE TABLE public.assessment_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  template_data JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.assessment_templates ENABLE ROW LEVEL SECURITY;

-- Policies for templates
CREATE POLICY "Templates are viewable by authenticated users"
ON public.assessment_templates
FOR SELECT
TO authenticated
USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Templates can be created by authenticated users"
ON public.assessment_templates
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Templates can be updated by creator or admin"
ON public.assessment_templates
FOR UPDATE
TO authenticated
USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Templates can be deleted by creator or admin"
ON public.assessment_templates
FOR DELETE
TO authenticated
USING (public.is_admin_or_hr(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_assessment_templates_updated_at
BEFORE UPDATE ON public.assessment_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();