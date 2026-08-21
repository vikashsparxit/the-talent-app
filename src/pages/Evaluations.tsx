import { useState, useMemo } from 'react';
import { Footer } from '@/components/Footer';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useNavigate } from 'react-router';
import { format, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { 
  ClipboardCheck, 
  Search, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  User,
  Filter,
  ArrowUpDown,
  CalendarIcon,
  X,
  Download
} from 'lucide-react';
import { Header } from '@/components/Header';
import { ExportReportDialog } from '@/components/evaluations/ExportReportDialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePendingEvaluations } from '@/hooks/useEvaluations';
import { computeIntegrityStats, normalizeIntegrityLog } from '@/lib/integrity';
import { cn } from '@/lib/utils';

type SortField = 'completed_at' | 'percentage' | 'candidate_name';
type SortOrder = 'asc' | 'desc';
type StatusFilter = 'all' | 'pending' | 'passed' | 'failed';

export default function Evaluations() {
  usePageTitle('Evaluations');
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortField, setSortField] = useState<SortField>('completed_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [isExportOpen, setIsExportOpen] = useState(false);
  
  const { data: evaluations = [], isLoading } = usePendingEvaluations();

  const filteredAndSortedEvaluations = useMemo(() => {
    const result = evaluations.filter((e) => {
      // Search filter
      const matchesSearch =
        e.candidate?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.candidate?.email?.toLowerCase() ?? '').includes(searchQuery.toLowerCase()) ||
        e.assessment?.title.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      // Status filter
      if (statusFilter === 'pending' && e.status !== 'completed') return false;
      if (statusFilter === 'passed' && (e.status !== 'evaluated' || e.passed !== true)) return false;
      if (statusFilter === 'failed' && (e.status !== 'evaluated' || e.passed !== false)) return false;

      // Date filter
      if (e.completed_at) {
        const completedDate = new Date(e.completed_at);
        if (dateFrom && isBefore(completedDate, startOfDay(dateFrom))) return false;
        if (dateTo && isAfter(completedDate, endOfDay(dateTo))) return false;
      } else {
        // If no completed_at, exclude if date filter is active
        if (dateFrom || dateTo) return false;
      }

      return true;
    });

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'completed_at': {
          const dateA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
          const dateB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
          comparison = dateA - dateB;
          break;
        }
        case 'percentage':
          comparison = (a.percentage || 0) - (b.percentage || 0);
          break;
        case 'candidate_name':
          comparison = (a.candidate?.name || '').localeCompare(b.candidate?.name || '');
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [evaluations, searchQuery, statusFilter, sortField, sortOrder, dateFrom, dateTo]);

  const completedCount = evaluations.filter(e => e.status === 'completed').length;
  const evaluatedCount = evaluations.filter(e => e.status === 'evaluated').length;

  const getStatusBadge = (status: string, passed?: boolean | null) => {
    if (status === 'completed') {
      return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">Pending Review</Badge>;
    }
    if (status === 'evaluated') {
      if (passed === true) {
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">Passed</Badge>;
      }
      if (passed === false) {
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">Failed</Badge>;
      }
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">Evaluated</Badge>;
    }
    return <Badge variant="secondary">{status}</Badge>;
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setDateFrom(undefined);
    setDateTo(undefined);
    setSortField('completed_at');
    setSortOrder('desc');
  };

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || dateFrom || dateTo;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Evaluations</h1>
          <p className="text-muted-foreground">Review and grade candidate assessments</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedCount}</div>
              <p className="text-xs text-muted-foreground">Awaiting evaluation</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Evaluated</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{evaluatedCount}</div>
              <p className="text-xs text-muted-foreground">Completed reviews</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Submissions</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{evaluations.length}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by candidate or assessment..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[160px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending Review</SelectItem>
              <SelectItem value="passed">Passed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>

          {/* Date From */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-[140px] justify-start text-left font-normal",
                  !dateFrom && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateFrom}
                onSelect={setDateFrom}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* Date To */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-[140px] justify-start text-left font-normal",
                  !dateTo && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateTo ? format(dateTo, "MMM d, yyyy") : "To"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateTo}
                onSelect={setDateTo}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={() => setIsExportOpen(true)}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>

        <ExportReportDialog
          open={isExportOpen}
          onOpenChange={setIsExportOpen}
          evaluations={filteredAndSortedEvaluations}
        />

        {/* Results count */}
        <p className="text-sm text-muted-foreground mb-4">
          Showing {filteredAndSortedEvaluations.length} of {evaluations.length} evaluations
        </p>

        {/* Evaluations Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 font-medium hover:bg-transparent"
                      onClick={() => toggleSort('candidate_name')}
                    >
                      Candidate
                      <ArrowUpDown className={cn(
                        "ml-2 h-4 w-4",
                        sortField === 'candidate_name' && "text-primary"
                      )} />
                    </Button>
                  </TableHead>
                  <TableHead>Assessment</TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 font-medium hover:bg-transparent"
                      onClick={() => toggleSort('completed_at')}
                    >
                      Completed
                      <ArrowUpDown className={cn(
                        "ml-2 h-4 w-4",
                        sortField === 'completed_at' && "text-primary"
                      )} />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 font-medium hover:bg-transparent"
                      onClick={() => toggleSort('percentage')}
                    >
                      Score
                      <ArrowUpDown className={cn(
                        "ml-2 h-4 w-4",
                        sortField === 'percentage' && "text-primary"
                      )} />
                    </Button>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Integrity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading evaluations...
                    </TableCell>
                  </TableRow>
                ) : filteredAndSortedEvaluations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No evaluations found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedEvaluations.map((evaluation) => (
                    <TableRow key={evaluation.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{evaluation.candidate?.name}</p>
                            <p className="text-sm text-muted-foreground">{evaluation.candidate?.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{evaluation.assessment?.title}</TableCell>
                      <TableCell>
                        {evaluation.completed_at
                          ? format(new Date(evaluation.completed_at), 'MMM d, yyyy HH:mm')
                          : '-'}
                      </TableCell>
                      <TableCell>
                        {evaluation.percentage !== null ? (
                          <span className={evaluation.passed ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                            {evaluation.percentage?.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(evaluation.status, evaluation.passed)}</TableCell>
                      <TableCell>
                        {(() => {
                          const stats = computeIntegrityStats(normalizeIntegrityLog(evaluation.integrity_log));
                          if (stats.eventCount === 0) {
                            return <span className="text-green-600 text-sm">Clean</span>;
                          }
                          return (
                            <div className="flex items-center gap-1 text-amber-600" title={`${stats.tabSwitchCount} tab switches, ${stats.eventCount} events`}>
                              <AlertTriangle className="h-4 w-4" />
                              <span className="text-sm">{stats.tabSwitchCount}</span>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/evaluations/${evaluation.id}`)}
                        >
                          {evaluation.status === 'completed' ? 'Review' : 'View'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
