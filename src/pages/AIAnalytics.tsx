import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { 
  Brain, 
  ClipboardList, 
  TrendingUp, 
  AlertTriangle, 
  Users, 
  CheckCircle2, 
  Clock, 
  ArrowRight,
  Activity,
  Target,
  FileWarning,
  User,
  Download,
  Filter,
  Search,
  Heart,
  Wind,
  HeartPulse,
  Shield,
  Cigarette,
  ChevronDown,
  ChevronRight,
  Info,
  ListChecks,
  Sparkles,
  BarChart3
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { QOF_INDICATORS, QOF_CATEGORIES, calculateQOFProgress } from '@/lib/qof-codes';
import QOFActionList from '@/components/qof/QOFActionList';

type GapFilter = 'all' | 'bp' | 'smoking' | 'no-data';
type PriorityFilter = 'all' | 'high' | 'medium' | 'normal';
type CategoryTab = 'all' | string;
type ViewTab = 'indicators' | 'actions';

const getCategoryIcon = (iconName: string) => {
  switch (iconName) {
    case 'Heart': return Heart;
    case 'Activity': return Activity;
    case 'Wind': return Wind;
    case 'Brain': return Brain;
    case 'HeartPulse': return HeartPulse;
    case 'Shield': return Shield;
    case 'Cigarette': return Cigarette;
    default: return Target;
  }
};

export default function AIAnalytics() {
  const [gapFilter, setGapFilter] = useState<GapFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('all');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Cardiovascular']));
  const [viewTab, setViewTab] = useState<ViewTab>('indicators');

  // Fetch patients with clinical data
  const { data: patients = [] } = useQuery({
    queryKey: ['analytics-patients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('id, name, nhs_number, phone_number, notes, conditions, hba1c_mmol_mol, hba1c_date, cholesterol_ldl, cholesterol_hdl, cholesterol_date, frailty_status, date_of_birth, cha2ds2_vasc_score')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch AI summaries for insights
  const { data: aiSummaries = [] } = useQuery({
    queryKey: ['analytics-ai-summaries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_summaries')
        .select(`
          id,
          patient_id,
          clinical_summary,
          qof_relevance,
          action_items,
          key_findings,
          created_at,
          patients (id, name)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch pending tasks
  const { data: pendingTasks = [] } = useQuery({
    queryKey: ['analytics-pending-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meditask_tasks')
        .select(`
          id,
          title,
          description,
          priority,
          status,
          due_date,
          patient_id,
          patients (id, name)
        `)
        .neq('status', 'completed')
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch call responses for analytics
  const { data: callResponses = [] } = useQuery({
    queryKey: ['analytics-call-responses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_responses')
        .select(`
          id,
          patient_id,
          blood_pressure_systolic,
          blood_pressure_diastolic,
          smoking_status,
          weight_kg,
          height_cm,
          collected_at,
          patients (id, name, nhs_number)
        `)
        .order('collected_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch health alerts
  const { data: healthAlerts = [] } = useQuery({
    queryKey: ['analytics-health-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('health_alerts')
        .select(`
          id,
          title,
          description,
          severity,
          alert_type,
          patient_id,
          acknowledged_at,
          patients (id, name)
        `)
        .is('acknowledged_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Calculate QOF gaps - patients missing key health metrics
  const calculateQOFGaps = () => {
    const patientsWithResponses = new Set(callResponses.map(r => r.patient_id));
    
    const missingResponses = patients.filter(p => !patientsWithResponses.has(p.id));
    
    const missingBP = patients.filter(p => {
      const responses = callResponses.filter(r => r.patient_id === p.id);
      return responses.length === 0 || !responses.some(r => r.blood_pressure_systolic && r.blood_pressure_diastolic);
    });

    const missingSmoking = patients.filter(p => {
      const responses = callResponses.filter(r => r.patient_id === p.id);
      return responses.length === 0 || !responses.some(r => r.smoking_status);
    });

    // Missing HbA1c for diabetic patients
    const diabeticPatients = patients.filter(p => 
      p.conditions?.some((c: string) => c.toLowerCase().includes('diabetes'))
    );
    const missingHbA1c = diabeticPatients.filter(p => !p.hba1c_mmol_mol);

    // Missing cholesterol for cardiovascular patients
    const cvdPatients = patients.filter(p => 
      p.conditions?.some((c: string) => 
        c.toLowerCase().includes('chd') || 
        c.toLowerCase().includes('stroke') || 
        c.toLowerCase().includes('hypertension') ||
        c.toLowerCase().includes('heart')
      )
    );
    const missingCholesterol = cvdPatients.filter(p => !p.cholesterol_ldl);

    return { missingResponses, missingBP, missingSmoking, missingHbA1c, missingCholesterol, diabeticPatients, cvdPatients };
  };

  const qofGaps = calculateQOFGaps();

  // Calculate condition-based patient cohorts
  const patientCohorts = {
    diabetes: patients.filter(p => p.conditions?.some((c: string) => c.toLowerCase().includes('diabetes'))),
    hypertension: patients.filter(p => p.conditions?.some((c: string) => c.toLowerCase().includes('hypertension'))),
    chd: patients.filter(p => p.conditions?.some((c: string) => c.toLowerCase().includes('chd') || c.toLowerCase().includes('coronary'))),
    asthma: patients.filter(p => p.conditions?.some((c: string) => c.toLowerCase().includes('asthma'))),
    copd: patients.filter(p => p.conditions?.some((c: string) => c.toLowerCase().includes('copd'))),
    af: patients.filter(p => p.conditions?.some((c: string) => c.toLowerCase().includes('atrial fibrillation') || c.toLowerCase().includes('af'))),
    stroke: patients.filter(p => p.conditions?.some((c: string) => c.toLowerCase().includes('stroke') || c.toLowerCase().includes('tia'))),
    mentalHealth: patients.filter(p => p.conditions?.some((c: string) => 
      c.toLowerCase().includes('schizophrenia') || 
      c.toLowerCase().includes('bipolar') || 
      c.toLowerCase().includes('psychosis') ||
      c.toLowerCase().includes('dementia')
    )),
    frail: patients.filter(p => p.frailty_status === 'moderate' || p.frailty_status === 'severe'),
  };

  // Filter patients by search and gap type
  const getFilteredGapPatients = () => {
    let filteredPatients: typeof patients = [];
    
    switch (gapFilter) {
      case 'bp':
        filteredPatients = qofGaps.missingBP;
        break;
      case 'smoking':
        filteredPatients = qofGaps.missingSmoking;
        break;
      case 'no-data':
        filteredPatients = qofGaps.missingResponses;
        break;
      default:
        const allGapPatientIds = new Set([
          ...qofGaps.missingBP.map(p => p.id),
          ...qofGaps.missingSmoking.map(p => p.id),
          ...qofGaps.missingResponses.map(p => p.id),
        ]);
        filteredPatients = patients.filter(p => allGapPatientIds.has(p.id));
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredPatients = filteredPatients.filter(p => 
        p.name.toLowerCase().includes(query) || 
        p.nhs_number?.toLowerCase().includes(query)
      );
    }

    return filteredPatients;
  };

  // Filter tasks by priority
  const getFilteredTasks = () => {
    let filtered = pendingTasks;
    if (priorityFilter !== 'all') {
      filtered = filtered.filter(t => t.priority === priorityFilter);
    }
    return filtered;
  };

  const filteredGapPatients = getFilteredGapPatients();
  const filteredTasks = getFilteredTasks();

  // Calculate KPIs with clinical data
  const kpis = {
    totalPatients: patients.length,
    patientsWithData: new Set(callResponses.map(r => r.patient_id)).size,
    patientsWithConditions: patients.filter(p => p.conditions && p.conditions.length > 0).length,
    pendingTasksCount: pendingTasks.length,
    highPriorityTasks: pendingTasks.filter(t => t.priority === 'high').length,
    unresolvedAlerts: healthAlerts.length,
    criticalAlerts: healthAlerts.filter(a => a.severity === 'critical').length,
    aiSummariesGenerated: aiSummaries.length,
    dataCompleteness: patients.length > 0 
      ? Math.round((new Set(callResponses.map(r => r.patient_id)).size / patients.length) * 100) 
      : 0,
    diabeticControlled: qofGaps.diabeticPatients.filter(p => p.hba1c_mmol_mol && p.hba1c_mmol_mol <= 58).length,
    bpControlled: callResponses.filter(r => 
      r.blood_pressure_systolic && r.blood_pressure_diastolic &&
      r.blood_pressure_systolic <= 140 && r.blood_pressure_diastolic <= 90
    ).length,
  };

  // Calculate QOF progress for each indicator using real patient data
  const getIndicatorProgress = (indicator: typeof QOF_INDICATORS[0]) => {
    let achieved = 0;
    let total = patients.length;

    // Calculate based on available data and patient conditions
    switch (indicator.code) {
      case 'SMOK002': {
        const patientsWithLTC = patients.filter(p => p.conditions && p.conditions.length > 0);
        total = patientsWithLTC.length || patients.length;
        achieved = callResponses.filter(r => r.smoking_status).length;
        break;
      }
      case 'HYP008': {
        total = patientCohorts.hypertension.length;
        achieved = callResponses.filter(r => {
          if (!r.blood_pressure_systolic || !r.blood_pressure_diastolic) return false;
          return r.blood_pressure_systolic <= 140 && r.blood_pressure_diastolic <= 90;
        }).length;
        break;
      }
      case 'HYP009': {
        total = patientCohorts.hypertension.length;
        achieved = callResponses.filter(r => {
          if (!r.blood_pressure_systolic || !r.blood_pressure_diastolic) return false;
          return r.blood_pressure_systolic <= 150 && r.blood_pressure_diastolic <= 90;
        }).length;
        break;
      }
      case 'DM006': {
        total = patientCohorts.diabetes.length;
        achieved = patientCohorts.diabetes.filter(p => p.hba1c_mmol_mol && p.hba1c_mmol_mol <= 58).length;
        break;
      }
      case 'DM012': {
        const diabeticFrail = patientCohorts.diabetes.filter(p => p.frailty_status === 'moderate' || p.frailty_status === 'severe');
        total = diabeticFrail.length;
        achieved = diabeticFrail.filter(p => p.hba1c_mmol_mol && p.hba1c_mmol_mol <= 75).length;
        break;
      }
      case 'DM036': {
        total = patientCohorts.diabetes.length;
        achieved = callResponses.filter(r => {
          const isDiabetic = patientCohorts.diabetes.some(p => p.id === r.patient_id);
          if (!isDiabetic || !r.blood_pressure_systolic || !r.blood_pressure_diastolic) return false;
          return r.blood_pressure_systolic <= 140 && r.blood_pressure_diastolic <= 90;
        }).length;
        break;
      }
      case 'CHOL003':
      case 'DM034':
      case 'DM035': {
        const relevantPatients = indicator.code.startsWith('DM') ? patientCohorts.diabetes : patientCohorts.chd;
        total = relevantPatients.length;
        achieved = relevantPatients.filter(p => p.cholesterol_ldl || p.cholesterol_hdl).length;
        break;
      }
      case 'CHOL004': {
        total = patientCohorts.chd.length + patientCohorts.stroke.length;
        achieved = patients.filter(p => p.cholesterol_ldl && p.cholesterol_ldl <= 2.0).length;
        break;
      }
      case 'AF007':
      case 'AF008': {
        total = patientCohorts.af.length;
        achieved = patientCohorts.af.filter(p => p.cha2ds2_vasc_score && p.cha2ds2_vasc_score >= 2).length;
        break;
      }
      case 'CHD015':
      case 'CHD016': {
        total = patientCohorts.chd.length;
        const target = indicator.ageGroup === 'over80' ? { sys: 150, dia: 90 } : { sys: 140, dia: 90 };
        achieved = callResponses.filter(r => {
          const isCHD = patientCohorts.chd.some(p => p.id === r.patient_id);
          if (!isCHD || !r.blood_pressure_systolic || !r.blood_pressure_diastolic) return false;
          return r.blood_pressure_systolic <= target.sys && r.blood_pressure_diastolic <= target.dia;
        }).length;
        break;
      }
      case 'STIA014':
      case 'STIA015': {
        total = patientCohorts.stroke.length;
        const target = indicator.ageGroup === 'over80' ? { sys: 150, dia: 90 } : { sys: 140, dia: 90 };
        achieved = callResponses.filter(r => {
          const isStroke = patientCohorts.stroke.some(p => p.id === r.patient_id);
          if (!isStroke || !r.blood_pressure_systolic || !r.blood_pressure_diastolic) return false;
          return r.blood_pressure_systolic <= target.sys && r.blood_pressure_diastolic <= target.dia;
        }).length;
        break;
      }
      case 'AST007': {
        total = patientCohorts.asthma.length;
        achieved = aiSummaries.filter(s => patientCohorts.asthma.some(p => p.id === s.patient_id)).length;
        break;
      }
      case 'COPD010': {
        total = patientCohorts.copd.length;
        achieved = aiSummaries.filter(s => patientCohorts.copd.some(p => p.id === s.patient_id)).length;
        break;
      }
      case 'MH002':
      case 'DEM004': {
        total = patientCohorts.mentalHealth.length;
        achieved = aiSummaries.filter(s => patientCohorts.mentalHealth.some(p => p.id === s.patient_id)).length;
        break;
      }
      default: {
        achieved = callResponses.length > 0 ? Math.min(callResponses.length, total) : 0;
      }
    }

    return calculateQOFProgress(indicator, achieved, total || 1);
  };

  // Group indicators by category
  const groupedIndicators = QOF_CATEGORIES.map(category => ({
    ...category,
    indicators: QOF_INDICATORS.filter(i => i.category === category.name.split(' ')[0] || 
      i.category.toLowerCase().includes(category.id.replace('-', ' ')))
  })).filter(cat => cat.indicators.length > 0);

  // Calculate overall category scores
  const getCategoryScore = (indicators: typeof QOF_INDICATORS) => {
    if (indicators.length === 0) return 0;
    const scores = indicators.map(i => getIndicatorProgress(i).percent);
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  };

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  // Export functions
  const exportToCSV = (data: any[], filename: string, headers: string[]) => {
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const key = h.toLowerCase().replace(/ /g, '_');
        const value = row[key] ?? '';
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success(`Exported ${data.length} records to ${filename}.csv`);
  };

  const exportQOFGaps = () => {
    const data = filteredGapPatients.map(p => {
      const hasBP = !qofGaps.missingBP.some(bp => bp.id === p.id);
      const hasSmoking = !qofGaps.missingSmoking.some(s => s.id === p.id);
      const hasData = !qofGaps.missingResponses.some(r => r.id === p.id);
      return {
        name: p.name,
        nhs_number: p.nhs_number || '',
        phone_number: p.phone_number,
        has_bp: hasBP ? 'Yes' : 'No',
        has_smoking: hasSmoking ? 'Yes' : 'No',
        has_call_data: hasData ? 'Yes' : 'No',
      };
    });
    exportToCSV(data, 'qof_gaps', ['Name', 'NHS_Number', 'Phone_Number', 'Has_BP', 'Has_Smoking', 'Has_Call_Data']);
  };

  const exportTasks = () => {
    const data = filteredTasks.map((t: any) => ({
      title: t.title,
      priority: t.priority,
      status: t.status,
      due_date: t.due_date ? new Date(t.due_date).toLocaleDateString() : '',
      patient_name: t.patients?.name || '',
    }));
    exportToCSV(data, 'pending_tasks', ['Title', 'Priority', 'Status', 'Due_Date', 'Patient_Name']);
  };

  const exportQOFProgress = () => {
    const data = QOF_INDICATORS.map(indicator => {
      const progress = getIndicatorProgress(indicator);
      return {
        code: indicator.code,
        name: indicator.name,
        category: indicator.category,
        condition: indicator.condition || '',
        target: `${indicator.targetPercent}%`,
        achieved: `${progress.percent}%`,
        gap: progress.gap > 0 ? `${progress.gap}%` : 'Met',
        status: progress.status,
      };
    });
    exportToCSV(data, 'qof_progress_full', ['Code', 'Name', 'Category', 'Condition', 'Target', 'Achieved', 'Gap', 'Status']);
  };

  const exportFullReport = () => {
    const summary = [
      { metric: 'Total Patients', value: kpis.totalPatients },
      { metric: 'Patients With Data', value: kpis.patientsWithData },
      { metric: 'Patients With Conditions', value: kpis.patientsWithConditions },
      { metric: 'Data Completeness', value: `${kpis.dataCompleteness}%` },
      { metric: 'AI Summaries Generated', value: kpis.aiSummariesGenerated },
      { metric: 'Pending Tasks', value: kpis.pendingTasksCount },
      { metric: 'High Priority Tasks', value: kpis.highPriorityTasks },
      { metric: 'Unresolved Alerts', value: kpis.unresolvedAlerts },
      { metric: 'Missing BP Records', value: qofGaps.missingBP.length },
      { metric: 'Missing Smoking Status', value: qofGaps.missingSmoking.length },
      { metric: 'No Call Data', value: qofGaps.missingResponses.length },
      { metric: '--- Cohorts ---', value: '' },
      { metric: 'Diabetes Patients', value: patientCohorts.diabetes.length },
      { metric: 'Diabetes Controlled (HbA1c ≤58)', value: kpis.diabeticControlled },
      { metric: 'Hypertension Patients', value: patientCohorts.hypertension.length },
      { metric: 'BP Controlled', value: kpis.bpControlled },
      { metric: 'CHD Patients', value: patientCohorts.chd.length },
      { metric: 'Asthma Patients', value: patientCohorts.asthma.length },
      { metric: 'COPD Patients', value: patientCohorts.copd.length },
      { metric: 'AF Patients', value: patientCohorts.af.length },
      { metric: 'Stroke/TIA Patients', value: patientCohorts.stroke.length },
      { metric: 'Mental Health Patients', value: patientCohorts.mentalHealth.length },
      { metric: 'Frail Patients', value: patientCohorts.frail.length },
    ];
    exportToCSV(summary, 'analytics_summary', ['Metric', 'Value']);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      default: return 'secondary';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'border-destructive/30 bg-destructive/5';
      case 'high': return 'border-warning/30 bg-warning/5';
      default: return 'border-muted bg-muted/30';
    }
  };

  const getStatusColor = (status: 'good' | 'warning' | 'poor') => {
    switch (status) {
      case 'good': return 'text-success';
      case 'warning': return 'text-warning';
      case 'poor': return 'text-destructive';
    }
  };

  // Calculate overall QOF score
  const overallQOFScore = groupedIndicators.length > 0
    ? Math.round(groupedIndicators.reduce((acc, cat) => acc + getCategoryScore(cat.indicators), 0) / groupedIndicators.length)
    : 0;

  return (
    <TooltipProvider>
      <div className="p-6 lg:p-8 space-y-6">
        {/* Enhanced Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-center gap-4">
            <div className="relative p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl shadow-sm">
              <Brain className="h-8 w-8 text-primary" />
              <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-primary animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
                AI Analytics
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Powered by AI
                </span>
              </h1>
              <p className="text-muted-foreground">Quality and Outcomes Framework tracking & insights</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportFullReport} className="gap-2">
              <Download className="h-4 w-4" />
              Summary
            </Button>
            <Button variant="outline" size="sm" onClick={exportQOFProgress} className="gap-2">
              <Download className="h-4 w-4" />
              Full Report
            </Button>
            <Button variant="outline" size="sm" onClick={exportQOFGaps} className="gap-2">
              <Download className="h-4 w-4" />
              Gaps List
            </Button>
          </div>
        </div>

        {/* Overall Score + Quick Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Overall QOF Score - Featured Card */}
          <Card className="lg:col-span-1 relative overflow-hidden border-0 shadow-lg animate-fade-in" style={{ animationDelay: '50ms' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-primary/80" />
            <CardContent className="relative pt-6 text-primary-foreground">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Target className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium opacity-90">Overall QOF Score</span>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-5xl font-bold">{overallQOFScore}</span>
                <span className="text-2xl font-medium mb-1">%</span>
              </div>
              <Progress value={overallQOFScore} className="h-2 mt-4 bg-white/20 [&>div]:bg-white" />
              <p className="text-xs mt-2 opacity-80">
                {overallQOFScore >= 75 ? '✓ On track for QOF targets' : 'Action needed to meet targets'}
              </p>
            </CardContent>
          </Card>

          {/* KPI Stats Grid */}
          <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all animate-fade-in" style={{ animationDelay: '100ms' }}>
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
              <CardContent className="pt-5 relative">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Users className="h-4 w-4" />
                  <span className="text-xs">Total Patients</span>
                </div>
                <p className="text-2xl font-bold">{kpis.totalPatients}</p>
                <p className="text-xs text-muted-foreground mt-1">{kpis.patientsWithData} with data</p>
              </CardContent>
            </Card>
            
            <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all animate-fade-in" style={{ animationDelay: '150ms' }}>
              <div className="absolute inset-0 bg-gradient-to-br from-success/10 via-success/5 to-transparent" />
              <CardContent className="pt-5 relative">
                <div className="flex items-center gap-2 text-success mb-1">
                  <Target className="h-4 w-4" />
                  <span className="text-xs">Data Complete</span>
                </div>
                <p className="text-2xl font-bold">{kpis.dataCompleteness}%</p>
                <Progress value={kpis.dataCompleteness} className="h-1.5 mt-2" />
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all animate-fade-in" style={{ animationDelay: '200ms' }}>
              <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent" />
              <CardContent className="pt-5 relative">
                <div className="flex items-center gap-2 text-accent mb-1">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-xs">AI Summaries</span>
                </div>
                <p className="text-2xl font-bold">{kpis.aiSummariesGenerated}</p>
                <p className="text-xs text-muted-foreground mt-1">Generated</p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all animate-fade-in" style={{ animationDelay: '250ms' }}>
              <div className="absolute inset-0 bg-gradient-to-br from-warning/10 via-warning/5 to-transparent" />
              <CardContent className="pt-5 relative">
                <div className="flex items-center gap-2 text-warning mb-1">
                  <ClipboardList className="h-4 w-4" />
                  <span className="text-xs">Pending Tasks</span>
                </div>
                <p className="text-2xl font-bold">{kpis.pendingTasksCount}</p>
                <p className="text-xs text-muted-foreground mt-1">{kpis.highPriorityTasks} high priority</p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all animate-fade-in" style={{ animationDelay: '300ms' }}>
              <div className="absolute inset-0 bg-gradient-to-br from-destructive/10 via-destructive/5 to-transparent" />
              <CardContent className="pt-5 relative">
                <div className="flex items-center gap-2 text-destructive mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-xs">Active Alerts</span>
                </div>
                <p className="text-2xl font-bold">{kpis.unresolvedAlerts}</p>
                <p className="text-xs text-muted-foreground mt-1">{kpis.criticalAlerts} critical</p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all animate-fade-in" style={{ animationDelay: '350ms' }}>
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
              <CardContent className="pt-5 relative">
                <div className="flex items-center gap-2 text-primary mb-1">
                  <Activity className="h-4 w-4" />
                  <span className="text-xs">With Conditions</span>
                </div>
                <p className="text-2xl font-bold">{kpis.patientsWithConditions}</p>
                <p className="text-xs text-muted-foreground mt-1">Tracked patients</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Patient Cohorts Overview */}
        <Card className="shadow-sm animate-fade-in" style={{ animationDelay: '400ms' }}>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Patient Cohorts</CardTitle>
                <CardDescription>Overview by clinical condition for targeted QOF interventions</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="p-4 rounded-xl bg-gradient-to-br from-destructive/10 to-destructive/5 border border-destructive/20 hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <Heart className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium">Hypertension</span>
                </div>
                <p className="text-3xl font-bold">{patientCohorts.hypertension.length}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="text-success">{kpis.bpControlled}</span> BP controlled
                </p>
              </div>
              
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Diabetes</span>
                </div>
                <p className="text-3xl font-bold">{patientCohorts.diabetes.length}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="text-success">{kpis.diabeticControlled}</span> HbA1c ≤58
                </p>
              </div>
              
              <div className="p-4 rounded-xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <HeartPulse className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium">CHD</span>
                </div>
                <p className="text-3xl font-bold">{patientCohorts.chd.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Coronary heart disease</p>
              </div>
              
              <div className="p-4 rounded-xl bg-gradient-to-br from-warning/10 to-warning/5 border border-warning/20 hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <Wind className="h-4 w-4 text-warning" />
                  <span className="text-sm font-medium">Respiratory</span>
                </div>
                <p className="text-3xl font-bold">{patientCohorts.asthma.length + patientCohorts.copd.length}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {patientCohorts.asthma.length} asthma, {patientCohorts.copd.length} COPD
                </p>
              </div>
              
              <div className="p-4 rounded-xl bg-gradient-to-br from-secondary to-secondary/50 border border-border hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Mental Health</span>
                </div>
                <p className="text-3xl font-bold">{patientCohorts.mentalHealth.length}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {patientCohorts.frail.length} frail patients
                </p>
              </div>
            </div>

            {aiSummaries.length > 0 && (
              <div className="mt-6 pt-6 border-t">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Recent AI Summaries
                  <Badge variant="secondary">{aiSummaries.length} total</Badge>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {aiSummaries.slice(0, 3).map((summary: any) => (
                    <div key={summary.id} className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <Link 
                          to={`/patients?search=${encodeURIComponent(summary.patients?.name || '')}`}
                          className="font-medium text-sm text-primary hover:underline"
                        >
                          {summary.patients?.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {new Date(summary.created_at).toLocaleDateString('en-GB')}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {summary.clinical_summary}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Tabs */}
        <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as ViewTab)} className="w-full animate-fade-in" style={{ animationDelay: '450ms' }}>
          <TabsList className="grid w-full max-w-md grid-cols-2 p-1 h-12">
            <TabsTrigger value="indicators" className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4" />
              QOF Indicators
            </TabsTrigger>
            <TabsTrigger value="actions" className="flex items-center gap-2 text-sm">
              <ListChecks className="h-4 w-4" />
              Action List
            </TabsTrigger>
          </TabsList>

          <TabsContent value="indicators" className="mt-6">
            <Card className="shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>NHS QOF Indicators 2024/25</CardTitle>
                    <CardDescription>Track achievement against Quality and Outcomes Framework targets</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-3">
                    {groupedIndicators.map((category) => {
                      const Icon = getCategoryIcon(category.icon);
                      const categoryScore = getCategoryScore(category.indicators);
                      const isExpanded = expandedCategories.has(category.name);

                      return (
                        <Collapsible
                          key={category.id}
                          open={isExpanded}
                          onOpenChange={() => toggleCategory(category.name)}
                        >
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center justify-between p-4 rounded-xl border bg-card cursor-pointer hover:bg-muted/50 hover:shadow-sm transition-all">
                              <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-primary/10 rounded-lg">
                                  <Icon className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                  <h3 className="font-semibold">{category.name}</h3>
                                  <p className="text-sm text-muted-foreground">
                                    {category.indicators.length} indicators
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <div className={`text-xl font-bold ${categoryScore >= 70 ? 'text-success' : categoryScore >= 50 ? 'text-warning' : 'text-destructive'}`}>
                                    {categoryScore}%
                                  </div>
                                  <div className="text-xs text-muted-foreground">avg. score</div>
                                </div>
                                <div className="p-1 rounded-md bg-muted">
                                  {isExpanded ? (
                                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="mt-2 ml-6 space-y-2 border-l-2 border-primary/20 pl-4">
                              {category.indicators.map((indicator) => {
                                const progress = getIndicatorProgress(indicator);
                                return (
                                  <div key={indicator.id} className="p-4 bg-muted/30 rounded-lg space-y-3 hover:bg-muted/50 transition-colors">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <Badge variant="outline" className="text-xs font-mono">
                                            {indicator.code}
                                          </Badge>
                                          <span className="font-medium text-sm">{indicator.name}</span>
                                          {indicator.condition && (
                                            <Badge variant="secondary" className="text-xs">
                                              {indicator.condition}
                                            </Badge>
                                          )}
                                          <Tooltip>
                                            <TooltipTrigger>
                                              <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="max-w-xs">
                                              <p className="text-sm">{indicator.description}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </div>
                                        {indicator.ageGroup && (
                                          <span className="text-xs text-muted-foreground">
                                            Age group: {indicator.ageGroup === 'under80' ? '≤79 years' : 
                                              indicator.ageGroup === 'over80' ? '≥80 years' : 
                                              indicator.ageGroup === '40plus' ? '40+ years' : 'All ages'}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-right shrink-0">
                                        <span className={`text-lg font-bold ${getStatusColor(progress.status)}`}>
                                          {progress.percent}%
                                        </span>
                                        <span className="text-muted-foreground text-sm"> / {indicator.targetPercent}%</span>
                                      </div>
                                    </div>
                                    <div className="relative">
                                      <Progress 
                                        value={progress.percent} 
                                        className={`h-2 ${
                                          progress.status === 'good' ? '[&>div]:bg-success' :
                                          progress.status === 'warning' ? '[&>div]:bg-warning' : '[&>div]:bg-destructive'
                                        }`}
                                      />
                                      <div 
                                        className="absolute top-0 h-2 w-0.5 bg-foreground/50" 
                                        style={{ left: `${Math.min(indicator.targetPercent, 100)}%` }}
                                      />
                                    </div>
                                    {progress.gap > 0 && (
                                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                                        <AlertTriangle className="h-3 w-3" />
                                        Gap: {progress.gap}% • ~{Math.ceil((progress.gap / 100) * patients.length)} patients needed
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="actions" className="mt-6">
            <QOFActionList />
          </TabsContent>
        </Tabs>

        {/* Bottom Grid: Tasks + Gaps */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in" style={{ animationDelay: '500ms' }}>
          {/* Pending Tasks */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-warning/10 rounded-lg">
                    <ClipboardList className="h-5 w-5 text-warning" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Pending Tasks</CardTitle>
                    <CardDescription>{filteredTasks.length} awaiting action</CardDescription>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={exportTasks}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as PriorityFilter)}>
                  <SelectTrigger className="h-8 w-[130px]">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[280px]">
                {filteredTasks.length > 0 ? (
                  <div className="space-y-2">
                    {filteredTasks.slice(0, 10).map((task: any) => (
                      <div key={task.id} className="p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-sm line-clamp-1">{task.title}</span>
                          <Badge variant={getPriorityColor(task.priority)} className="shrink-0 text-xs">
                            {task.priority}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          {task.patients && (
                            <Link 
                              to={`/patients?search=${encodeURIComponent(task.patients.name)}`}
                              className="flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <User className="h-3 w-3" />
                              {task.patients.name}
                            </Link>
                          )}
                          {task.due_date && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {new Date(task.due_date).toLocaleDateString('en-GB')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                    <CheckCircle2 className="h-10 w-10 mb-2 opacity-50" />
                    <p className="text-sm">No pending tasks</p>
                  </div>
                )}
              </ScrollArea>
              <Button asChild variant="outline" className="w-full mt-4">
                <Link to="/meditask">
                  View All Tasks <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* QOF Gaps */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-destructive/10 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <CardTitle className="text-base">QOF Gaps</CardTitle>
                    <CardDescription>Patients missing key health data</CardDescription>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={exportQOFGaps}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select value={gapFilter} onValueChange={(v) => setGapFilter(v as GapFilter)}>
                  <SelectTrigger className="h-8 w-[160px]">
                    <SelectValue placeholder="Filter by gap" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Gaps</SelectItem>
                    <SelectItem value="bp">Missing BP ({qofGaps.missingBP.length})</SelectItem>
                    <SelectItem value="smoking">Missing Smoking ({qofGaps.missingSmoking.length})</SelectItem>
                    <SelectItem value="no-data">No Data ({qofGaps.missingResponses.length})</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative flex-1 min-w-[120px]">
                  <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[280px]">
                {filteredGapPatients.length > 0 ? (
                  <div className="space-y-2">
                    {filteredGapPatients.slice(0, 15).map((patient) => {
                      const missingItems = [];
                      if (qofGaps.missingBP.some(p => p.id === patient.id)) missingItems.push('BP');
                      if (qofGaps.missingSmoking.some(p => p.id === patient.id)) missingItems.push('Smoking');
                      if (qofGaps.missingResponses.some(p => p.id === patient.id)) missingItems.push('No Data');
                      
                      return (
                        <Link
                          key={patient.id}
                          to={`/patients?search=${encodeURIComponent(patient.name)}`}
                          className="flex items-center gap-3 p-2.5 rounded-lg border hover:bg-muted/50 hover:shadow-sm transition-all"
                        >
                          <div className="p-1.5 bg-muted rounded-full">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{patient.name}</p>
                            <p className="text-xs text-muted-foreground">{patient.nhs_number}</p>
                          </div>
                          <div className="flex gap-1 flex-wrap justify-end">
                            {missingItems.map(item => (
                              <Badge key={item} variant="outline" className="text-xs px-1.5 py-0">
                                {item}
                              </Badge>
                            ))}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                    <CheckCircle2 className="h-10 w-10 mb-2 opacity-50" />
                    <p className="text-sm">No patients match filters</p>
                  </div>
                )}
              </ScrollArea>
              {filteredGapPatients.length > 15 && (
                <p className="text-xs text-muted-foreground text-center mt-3">
                  Showing 15 of {filteredGapPatients.length} patients
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Health Alerts */}
        {healthAlerts.length > 0 && (
          <Card className="shadow-sm animate-fade-in" style={{ animationDelay: '550ms' }}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-destructive/10 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <CardTitle>Unresolved Health Alerts</CardTitle>
                  <CardDescription>{healthAlerts.length} alerts requiring attention</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {healthAlerts.slice(0, 6).map((alert: any) => (
                  <div key={alert.id} className={`p-4 rounded-xl border ${getSeverityColor(alert.severity)} hover:shadow-md transition-all`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="font-medium text-sm">{alert.title}</span>
                      <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'} className="text-xs">
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{alert.description}</p>
                    {alert.patients && (
                      <Link 
                        to={`/patients?search=${encodeURIComponent(alert.patients.name)}`}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <User className="h-3 w-3" />
                        {alert.patients.name}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}