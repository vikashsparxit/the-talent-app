import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Download, FileText } from 'lucide-react';
import { exportToCSV, formatDateForExport, formatPercentage, formatBoolean } from '@/lib/exportUtils';
import { useToast } from '@/hooks/use-toast';

interface Evaluation {
  id: string;
  status: string;
  passed: boolean | null;
  percentage: number | null;
  total_score: number | null;
  completed_at: string | null;
  started_at: string | null;
  candidate?: {
    name: string;
    email: string;
    role_applied?: string | null;
  };
  assessment?: {
    title: string;
  };
  integrity_log?: unknown[];
}

interface ExportReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evaluations: Evaluation[];
}

const AVAILABLE_COLUMNS = [
  { id: 'candidate_name', label: 'Candidate Name', key: 'candidate.name' },
  { id: 'candidate_email', label: 'Candidate Email', key: 'candidate.email' },
  { id: 'role_applied', label: 'Role Applied', key: 'candidate.role_applied' },
  { id: 'assessment', label: 'Assessment', key: 'assessment.title' },
  { id: 'status', label: 'Status', key: 'status' },
  { id: 'passed', label: 'Passed', key: 'passed' },
  { id: 'percentage', label: 'Score (%)', key: 'percentage' },
  { id: 'total_score', label: 'Total Score', key: 'total_score' },
  { id: 'started_at', label: 'Started At', key: 'started_at' },
  { id: 'completed_at', label: 'Completed At', key: 'completed_at' },
  { id: 'integrity_issues', label: 'Integrity Issues', key: 'integrity_log' },
] as const;

export function ExportReportDialog({
  open,
  onOpenChange,
  evaluations,
}: ExportReportDialogProps) {
  const { toast } = useToast();
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'candidate_name',
    'candidate_email',
    'assessment',
    'status',
    'passed',
    'percentage',
    'completed_at',
  ]);
  const [exportScope, setExportScope] = useState<'all' | 'filtered'>('filtered');

  const toggleColumn = (columnId: string) => {
    setSelectedColumns(prev =>
      prev.includes(columnId)
        ? prev.filter(id => id !== columnId)
        : [...prev, columnId]
    );
  };

  const handleExport = () => {
    if (selectedColumns.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No columns selected',
        description: 'Please select at least one column to export.',
      });
      return;
    }

    try {
      const columns = selectedColumns.map(id => {
        const col = AVAILABLE_COLUMNS.find(c => c.id === id)!;
        return {
          key: col.key,
          label: col.label,
          format: (value: unknown, row: Evaluation) => {
            if (col.id === 'passed') return formatBoolean(value as boolean);
            if (col.id === 'percentage') return formatPercentage(value as number);
            if (col.id === 'started_at' || col.id === 'completed_at') {
              return formatDateForExport(value as string);
            }
            if (col.id === 'integrity_issues') {
              const log = value as unknown[] | undefined;
              return log?.length ? String(log.length) : '0';
            }
            return String(value ?? '');
          },
        };
      });

      const filename = `evaluations-report-${new Date().toISOString().split('T')[0]}`;
      exportToCSV(evaluations, columns, filename);
      
      toast({ title: `Exported ${evaluations.length} records` });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Export failed',
        description: error.message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Export Report
          </DialogTitle>
          <DialogDescription>
            Export evaluation data to a CSV file.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label>Columns to include</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AVAILABLE_COLUMNS.map((column) => (
                <div key={column.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={column.id}
                    checked={selectedColumns.includes(column.id)}
                    onCheckedChange={() => toggleColumn(column.id)}
                  />
                  <label
                    htmlFor={column.id}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {column.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 bg-muted rounded-lg text-sm">
            <p className="font-medium">Export summary</p>
            <p className="text-muted-foreground mt-1">
              {evaluations.length} evaluation(s) with {selectedColumns.length} column(s)
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={selectedColumns.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
