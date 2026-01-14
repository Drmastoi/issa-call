import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { 
  ClipboardList, 
  User, 
  Download, 
  Search,
  Phone,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Filter,
  Pill,
  Activity,
  Heart
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { QOF_INDICATORS, QOFIndicator } from '@/lib/qof-codes';
import { differenceInYears, parseISO } from 'date-fns';

interface Patient {
  id: string;
  name: string;
  nhs_number: string | null;
  phone_number: string;
  date_of_birth: string | null;
  conditions: string[] | null;
  medications: string[] | null;
  hba1c_mmol_mol: number | null;
  hba1c_date: string | null;
  cholesterol_ldl: number | null;
  cholesterol_hdl: number | null;
  cholesterol_date: string | null;
  frailty_status: string | null;
  last_review_date: string | null;
  cha2ds2_vasc_score: number | null;
}

interface CallResponse {
  id: string;
  patient_id: string;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  smoking_status: string | null;
  collected_at: string;
}

interface ActionItem {
  patient: Patient;
  indicator: QOFIndicator;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  actionRequired: string;
}

export default function QOFActionList() {
  const [selectedIndicator, setSelectedIndicator] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set());

  // Fetch patients with clinical data
  const { data: patients = [], isLoading: patientsLoading } = useQuery({
    queryKey: ['qof-action-patients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('id, name, nhs_number, phone_number, date_of_birth, conditions, medications, hba1c_mmol_mol, hba1c_date, cholesterol_ldl, cholesterol_hdl, cholesterol_date, frailty_status, last_review_date, cha2ds2_vasc_score')
        .order('name');
      if (error) throw error;
      return (data ?? []) as Patient[];
    },
  });

  // Fetch call responses
  const { data: callResponses = [] } = useQuery({
    queryKey: ['qof-action-responses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_responses')
        .select('id, patient_id, blood_pressure_systolic, blood_pressure_diastolic, smoking_status, collected_at')
        .order('collected_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CallResponse[];
    },
  });

  // Get patient's age
  const getPatientAge = (dob: string | null): number | null => {
    if (!dob) return null;
    try {
      return differenceInYears(new Date(), parseISO(dob));
    } catch {
      return null;
    }
  };

  // Get latest BP for patient
  const getLatestBP = (patientId: string) => {
    const response = callResponses.find(r => r.patient_id === patientId && r.blood_pressure_systolic && r.blood_pressure_diastolic);
    return response ? { systolic: response.blood_pressure_systolic!, diastolic: response.blood_pressure_diastolic! } : null;
  };

  // Get smoking status for patient
  const getSmokingStatus = (patientId: string) => {
    const response = callResponses.find(r => r.patient_id === patientId && r.smoking_status);
    return response?.smoking_status;
  };

  // Check if patient has condition
  const hasCondition = (patient: Patient, ...conditions: string[]) => {
    if (!patient.conditions) return false;
    return conditions.some(c => 
      patient.conditions!.some(pc => pc.toLowerCase().includes(c.toLowerCase()))
    );
  };

  // Check if patient has medication
  const hasMedication = (patient: Patient, ...meds: string[]) => {
    if (!patient.medications) return false;
    return meds.some(m => 
      patient.medications!.some(pm => pm.toLowerCase().includes(m.toLowerCase()))
    );
  };

  // Generate action items for each patient based on QOF indicators
  const actionItems = useMemo(() => {
    const items: ActionItem[] = [];

    patients.forEach(patient => {
      const age = getPatientAge(patient.date_of_birth);
      const bp = getLatestBP(patient.id);
      const smokingStatus = getSmokingStatus(patient.id);

      QOF_INDICATORS.forEach(indicator => {
        let needsAction = false;
        let reason = '';
        let actionRequired = '';
        let priority: 'high' | 'medium' | 'low' = 'medium';

        switch (indicator.code) {
          // Cardiovascular - Cholesterol
          case 'CHOL003':
            if (hasCondition(patient, 'CHD', 'PAD', 'Stroke', 'TIA', 'CKD') && !hasMedication(patient, 'Statin', 'Lipid')) {
              needsAction = true;
              reason = 'CVD patient not on statin therapy';
              actionRequired = 'Review for statin prescription';
              priority = 'high';
            }
            break;

          case 'CHOL004':
            if (hasCondition(patient, 'CHD', 'PAD', 'Stroke', 'TIA')) {
              if (!patient.cholesterol_ldl || patient.cholesterol_ldl > 2.0) {
                needsAction = true;
                reason = patient.cholesterol_ldl ? `LDL cholesterol ${patient.cholesterol_ldl} mmol/L (target ≤2.0)` : 'No cholesterol recorded';
                actionRequired = 'Check cholesterol and review treatment';
                priority = patient.cholesterol_ldl && patient.cholesterol_ldl > 2.5 ? 'high' : 'medium';
              }
            }
            break;

          // Hypertension
          case 'HYP008':
            if (hasCondition(patient, 'Hypertension') && age && age <= 79) {
              if (!bp || bp.systolic > 140 || bp.diastolic > 90) {
                needsAction = true;
                reason = bp ? `BP ${bp.systolic}/${bp.diastolic} mmHg (target ≤140/90)` : 'No BP recorded';
                actionRequired = 'BP check and medication review';
                priority = bp && (bp.systolic > 160 || bp.diastolic > 100) ? 'high' : 'medium';
              }
            }
            break;

          case 'HYP009':
            if (hasCondition(patient, 'Hypertension') && age && age >= 80) {
              if (!bp || bp.systolic > 150 || bp.diastolic > 90) {
                needsAction = true;
                reason = bp ? `BP ${bp.systolic}/${bp.diastolic} mmHg (target ≤150/90)` : 'No BP recorded';
                actionRequired = 'BP check and medication review';
                priority = bp && (bp.systolic > 170 || bp.diastolic > 100) ? 'high' : 'medium';
              }
            }
            break;

          // CHD BP
          case 'CHD015':
            if (hasCondition(patient, 'CHD') && age && age <= 79) {
              if (!bp || bp.systolic > 140 || bp.diastolic > 90) {
                needsAction = true;
                reason = bp ? `BP ${bp.systolic}/${bp.diastolic} mmHg (CHD target ≤140/90)` : 'No BP recorded';
                actionRequired = 'BP check - CHD patient';
                priority = 'high';
              }
            }
            break;

          case 'CHD016':
            if (hasCondition(patient, 'CHD') && age && age >= 80) {
              if (!bp || bp.systolic > 150 || bp.diastolic > 90) {
                needsAction = true;
                reason = bp ? `BP ${bp.systolic}/${bp.diastolic} mmHg (CHD target ≤150/90)` : 'No BP recorded';
                actionRequired = 'BP check - elderly CHD patient';
                priority = 'high';
              }
            }
            break;

          // Stroke/TIA BP
          case 'STIA014':
            if (hasCondition(patient, 'Stroke', 'TIA') && age && age <= 79) {
              if (!bp || bp.systolic > 140 || bp.diastolic > 90) {
                needsAction = true;
                reason = bp ? `BP ${bp.systolic}/${bp.diastolic} mmHg (Stroke target ≤140/90)` : 'No BP recorded';
                actionRequired = 'BP check - Stroke/TIA patient';
                priority = 'high';
              }
            }
            break;

          case 'STIA015':
            if (hasCondition(patient, 'Stroke', 'TIA') && age && age >= 80) {
              if (!bp || bp.systolic > 150 || bp.diastolic > 90) {
                needsAction = true;
                reason = bp ? `BP ${bp.systolic}/${bp.diastolic} mmHg (Stroke target ≤150/90)` : 'No BP recorded';
                actionRequired = 'BP check - elderly Stroke/TIA patient';
                priority = 'high';
              }
            }
            break;

          // AF
          case 'AF007':
            if (hasCondition(patient, 'AF', 'Atrial Fibrillation') && 
                (patient.cha2ds2_vasc_score ?? 0) >= 2 && 
                !hasMedication(patient, 'Anticoagulant', 'DOAC', 'Warfarin', 'Apixaban', 'Rivaroxaban', 'Edoxaban', 'Dabigatran')) {
              needsAction = true;
              reason = `AF with CHA2DS2-VASc ≥2, not on anticoagulation`;
              actionRequired = 'Review for anticoagulation therapy';
              priority = 'high';
            }
            break;

          case 'AF008':
            if (hasCondition(patient, 'AF', 'Atrial Fibrillation') && 
                (patient.cha2ds2_vasc_score ?? 0) >= 2 && 
                !hasMedication(patient, 'DOAC', 'Apixaban', 'Rivaroxaban', 'Edoxaban', 'Dabigatran', 'Warfarin')) {
              needsAction = true;
              reason = `AF patient not on DOAC/Warfarin`;
              actionRequired = 'Prescribe DOAC or Vitamin K antagonist';
              priority = 'high';
            }
            break;

          // Diabetes
          case 'DM036':
            if (hasCondition(patient, 'Diabetes') && age && age <= 79 && patient.frailty_status !== 'moderate' && patient.frailty_status !== 'severe') {
              if (!bp || bp.systolic > 140 || bp.diastolic > 90) {
                needsAction = true;
                reason = bp ? `BP ${bp.systolic}/${bp.diastolic} mmHg (DM target ≤140/90)` : 'No BP recorded';
                actionRequired = 'BP check - diabetes patient';
                priority = 'high';
              }
            }
            break;

          case 'DM034':
            if (hasCondition(patient, 'Diabetes') && age && age >= 40 && !hasCondition(patient, 'CVD', 'CHD', 'Stroke', 'PAD')) {
              if (!hasMedication(patient, 'Statin')) {
                needsAction = true;
                reason = 'Diabetes patient 40+ not on statin (no CVD history)';
                actionRequired = 'Review for statin prescription';
                priority = 'medium';
              }
            }
            break;

          case 'DM035':
            if (hasCondition(patient, 'Diabetes') && hasCondition(patient, 'CVD', 'CHD', 'Stroke', 'PAD')) {
              if (!hasMedication(patient, 'Statin')) {
                needsAction = true;
                reason = 'Diabetes + CVD patient not on statin';
                actionRequired = 'Review for statin prescription';
                priority = 'high';
              }
            }
            break;

          case 'DM006':
            if (hasCondition(patient, 'Diabetes') && patient.frailty_status !== 'moderate' && patient.frailty_status !== 'severe') {
              if (!patient.hba1c_mmol_mol || patient.hba1c_mmol_mol > 58) {
                needsAction = true;
                reason = patient.hba1c_mmol_mol ? `HbA1c ${patient.hba1c_mmol_mol} mmol/mol (target ≤58)` : 'No HbA1c recorded';
                actionRequired = 'HbA1c check and diabetes review';
                priority = patient.hba1c_mmol_mol && patient.hba1c_mmol_mol > 75 ? 'high' : 'medium';
              }
            }
            break;

          case 'DM012':
            if (hasCondition(patient, 'Diabetes') && (patient.frailty_status === 'moderate' || patient.frailty_status === 'severe')) {
              if (!patient.hba1c_mmol_mol || patient.hba1c_mmol_mol > 75) {
                needsAction = true;
                reason = patient.hba1c_mmol_mol ? `HbA1c ${patient.hba1c_mmol_mol} mmol/mol (frail target ≤75)` : 'No HbA1c recorded';
                actionRequired = 'HbA1c check - frail diabetes patient';
                priority = 'medium';
              }
            }
            break;

          // Respiratory
          case 'AST007':
            if (hasCondition(patient, 'Asthma')) {
              const reviewDate = patient.last_review_date ? parseISO(patient.last_review_date) : null;
              const monthsSinceReview = reviewDate ? differenceInYears(new Date(), reviewDate) * 12 : null;
              if (!reviewDate || monthsSinceReview === null || monthsSinceReview > 12) {
                needsAction = true;
                reason = reviewDate ? `Last review ${Math.round(monthsSinceReview!)} months ago` : 'No asthma review recorded';
                actionRequired = 'Book asthma review';
                priority = 'medium';
              }
            }
            break;

          case 'COPD010':
            if (hasCondition(patient, 'COPD')) {
              const reviewDate = patient.last_review_date ? parseISO(patient.last_review_date) : null;
              const monthsSinceReview = reviewDate ? differenceInYears(new Date(), reviewDate) * 12 : null;
              if (!reviewDate || monthsSinceReview === null || monthsSinceReview > 12) {
                needsAction = true;
                reason = 'FeV1 not recorded in past 12 months';
                actionRequired = 'Book COPD review with spirometry';
                priority = 'medium';
              }
            }
            break;

          // Mental Health
          case 'MH002':
            if (hasCondition(patient, 'Schizophrenia', 'Bipolar', 'Psychosis', 'SMI')) {
              const reviewDate = patient.last_review_date ? parseISO(patient.last_review_date) : null;
              if (!reviewDate) {
                needsAction = true;
                reason = 'No comprehensive care plan recorded';
                actionRequired = 'Create SMI care plan';
                priority = 'high';
              }
            }
            break;

          case 'DEM004':
            if (hasCondition(patient, 'Dementia')) {
              const reviewDate = patient.last_review_date ? parseISO(patient.last_review_date) : null;
              const monthsSinceReview = reviewDate ? differenceInYears(new Date(), reviewDate) * 12 : null;
              if (!reviewDate || monthsSinceReview === null || monthsSinceReview > 12) {
                needsAction = true;
                reason = reviewDate ? `Last review ${Math.round(monthsSinceReview!)} months ago` : 'No dementia review recorded';
                actionRequired = 'Book dementia review (include carer support)';
                priority = 'medium';
              }
            }
            break;

          // Heart Failure
          case 'HF003':
            if (hasCondition(patient, 'Heart Failure', 'HF', 'LVSD')) {
              if (!hasMedication(patient, 'ACE', 'ARB', 'Ramipril', 'Lisinopril', 'Enalapril', 'Losartan', 'Candesartan', 'Valsartan')) {
                needsAction = true;
                reason = 'Heart failure patient not on ACE-I or ARB';
                actionRequired = 'Review for ACE-I/ARB prescription';
                priority = 'high';
              }
            }
            break;

          case 'HF006':
            if (hasCondition(patient, 'Heart Failure', 'HF', 'LVSD')) {
              if (!hasMedication(patient, 'Beta-blocker', 'Bisoprolol', 'Carvedilol', 'Nebivolol', 'Metoprolol')) {
                needsAction = true;
                reason = 'Heart failure patient not on beta-blocker';
                actionRequired = 'Review for beta-blocker prescription';
                priority = 'high';
              }
            }
            break;

          // Smoking
          case 'SMOK002':
            if (patient.conditions && patient.conditions.length > 0) {
              if (!smokingStatus) {
                needsAction = true;
                reason = 'Long-term condition patient - smoking status not recorded';
                actionRequired = 'Record smoking status';
                priority = 'low';
              }
            }
            break;
        }

        if (needsAction) {
          items.push({ patient, indicator, reason, priority, actionRequired });
        }
      });
    });

    return items;
  }, [patients, callResponses]);

  // Filter action items
  const filteredActions = useMemo(() => {
    let filtered = actionItems;

    if (selectedIndicator !== 'all') {
      filtered = filtered.filter(a => a.indicator.code === selectedIndicator);
    }

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(a => a.indicator.category === selectedCategory);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a => 
        a.patient.name.toLowerCase().includes(query) ||
        a.patient.nhs_number?.toLowerCase().includes(query)
      );
    }

    // Sort by priority
    return filtered.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [actionItems, selectedIndicator, selectedCategory, searchQuery]);

  // Get unique categories and indicators
  const categories = [...new Set(QOF_INDICATORS.map(i => i.category))];
  const indicators = selectedCategory === 'all' 
    ? QOF_INDICATORS 
    : QOF_INDICATORS.filter(i => i.category === selectedCategory);

  // Toggle action selection
  const toggleAction = (actionId: string) => {
    const newSelected = new Set(selectedActions);
    if (newSelected.has(actionId)) {
      newSelected.delete(actionId);
    } else {
      newSelected.add(actionId);
    }
    setSelectedActions(newSelected);
  };

  // Select all visible actions
  const selectAll = () => {
    if (selectedActions.size === filteredActions.length) {
      setSelectedActions(new Set());
    } else {
      setSelectedActions(new Set(filteredActions.map(a => `${a.patient.id}-${a.indicator.code}`)));
    }
  };

  // Export actions
  const exportActions = () => {
    const data = filteredActions.map(a => ({
      patient_name: a.patient.name,
      nhs_number: a.patient.nhs_number || '',
      phone: a.patient.phone_number,
      indicator_code: a.indicator.code,
      indicator_name: a.indicator.name,
      category: a.indicator.category,
      reason: a.reason,
      action_required: a.actionRequired,
      priority: a.priority,
    }));

    const headers = ['Patient_Name', 'NHS_Number', 'Phone', 'Indicator_Code', 'Indicator_Name', 'Category', 'Reason', 'Action_Required', 'Priority'];
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const key = h.toLowerCase();
        const value = row[key as keyof typeof row] ?? '';
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `qof_actions_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success(`Exported ${data.length} action items`);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      default: return 'secondary';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'medium': return <Activity className="h-4 w-4 text-amber-500" />;
      default: return <CheckCircle2 className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Group actions by indicator for summary
  const actionsByIndicator = useMemo(() => {
    const grouped: Record<string, { indicator: QOFIndicator; count: number; highPriority: number }> = {};
    filteredActions.forEach(a => {
      if (!grouped[a.indicator.code]) {
        grouped[a.indicator.code] = { indicator: a.indicator, count: 0, highPriority: 0 };
      }
      grouped[a.indicator.code].count++;
      if (a.priority === 'high') grouped[a.indicator.code].highPriority++;
    });
    return Object.values(grouped).sort((a, b) => b.highPriority - a.highPriority || b.count - a.count);
  }, [filteredActions]);

  if (patientsLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center text-muted-foreground">
            Loading action list...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              QOF Action List
            </CardTitle>
            <CardDescription>
              {filteredActions.length} patients requiring intervention • {actionsByIndicator.length} indicators with gaps
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={exportActions}>
            <Download className="h-4 w-4 mr-2" />
            Export Actions
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Select value={selectedIndicator} onValueChange={setSelectedIndicator}>
            <SelectTrigger className="h-8 w-[180px]">
              <SelectValue placeholder="Indicator" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Indicators</SelectItem>
              {indicators.map(ind => (
                <SelectItem key={ind.code} value={ind.code}>{ind.code} - {ind.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search patients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8"
            />
          </div>
        </div>

        {/* Summary badges */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <Badge variant="destructive">
            {filteredActions.filter(a => a.priority === 'high').length} High Priority
          </Badge>
          <Badge variant="outline">
            {filteredActions.filter(a => a.priority === 'medium').length} Medium
          </Badge>
          <Badge variant="secondary">
            {filteredActions.filter(a => a.priority === 'low').length} Low
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        {/* Indicator Summary */}
        {actionsByIndicator.length > 0 && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-medium mb-2">Top Gaps by Indicator</h4>
            <div className="flex flex-wrap gap-2">
              {actionsByIndicator.slice(0, 6).map(({ indicator, count, highPriority }) => (
                <Tooltip key={indicator.code}>
                  <TooltipTrigger asChild>
                    <Badge 
                      variant={highPriority > 0 ? 'destructive' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => setSelectedIndicator(indicator.code)}
                    >
                      {indicator.code}: {count}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">{indicator.name}</p>
                    <p className="text-xs">{count} patients, {highPriority} high priority</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        )}

        <ScrollArea className="h-[500px]">
          {filteredActions.length > 0 ? (
            <div className="space-y-2">
              {/* Select all header */}
              <div className="flex items-center gap-2 py-2 border-b">
                <Checkbox 
                  checked={selectedActions.size === filteredActions.length && filteredActions.length > 0}
                  onCheckedChange={selectAll}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedActions.size > 0 ? `${selectedActions.size} selected` : 'Select all'}
                </span>
              </div>

              {filteredActions.map((action) => {
                const actionId = `${action.patient.id}-${action.indicator.code}`;
                return (
                  <div 
                    key={actionId} 
                    className={`p-3 border rounded-lg space-y-2 transition-colors ${
                      selectedActions.has(actionId) ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox 
                        checked={selectedActions.has(actionId)}
                        onCheckedChange={() => toggleAction(actionId)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <Link 
                            to={`/patients?search=${encodeURIComponent(action.patient.name)}`}
                            className="flex items-center gap-2 font-medium text-sm hover:text-primary"
                          >
                            <User className="h-4 w-4" />
                            {action.patient.name}
                          </Link>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs font-mono">
                              {action.indicator.code}
                            </Badge>
                            <Badge variant={getPriorityColor(action.priority)}>
                              {action.priority}
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                          {action.patient.nhs_number && (
                            <span>NHS: {action.patient.nhs_number}</span>
                          )}
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {action.patient.phone_number}
                          </span>
                          {action.patient.date_of_birth && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Age: {getPatientAge(action.patient.date_of_birth)}
                            </span>
                          )}
                        </div>

                        <div className="mt-2 p-2 bg-muted/50 rounded text-sm">
                          <div className="flex items-start gap-2">
                            {getPriorityIcon(action.priority)}
                            <div>
                              <p className="text-muted-foreground">{action.reason}</p>
                              <p className="font-medium mt-1">{action.actionRequired}</p>
                            </div>
                          </div>
                        </div>

                        {/* Show conditions and medications if relevant */}
                        {(action.patient.conditions?.length || action.patient.medications?.length) && (
                          <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
                            {action.patient.conditions?.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Heart className="h-3 w-3 text-red-500" />
                                {action.patient.conditions.slice(0, 3).join(', ')}
                                {action.patient.conditions.length > 3 && ` +${action.patient.conditions.length - 3}`}
                              </span>
                            )}
                            {action.patient.medications?.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Pill className="h-3 w-3 text-blue-500" />
                                {action.patient.medications.slice(0, 3).join(', ')}
                                {action.patient.medications.length > 3 && ` +${action.patient.medications.length - 3}`}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mb-4 text-green-500" />
              <p className="font-medium">No actions required</p>
              <p className="text-sm">All patients meeting QOF targets or no clinical data available</p>
              <p className="text-xs mt-2">Add clinical conditions and medications to patients to generate action items</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
