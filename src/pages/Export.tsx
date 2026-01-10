import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Download, FileSpreadsheet, Calendar, Filter } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';

interface ExportableData {
  patient_name: string;
  patient_phone: string;
  nhs_number: string | null;
  call_date: string;
  weight_kg: number | null;
  height_cm: number | null;
  smoking_status: string | null;
  alcohol_units_per_week: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  pulse_rate: number | null;
  is_carer: boolean | null;
}

export default function Export() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedFields, setSelectedFields] = useState<string[]>([
    'patient_name', 'patient_phone', 'nhs_number', 'call_date',
    'weight_kg', 'height_cm', 'smoking_status', 'alcohol_units_per_week',
    'blood_pressure_systolic', 'blood_pressure_diastolic', 'pulse_rate', 'is_carer'
  ]);
  const { logAction } = useAuditLog();
  const { toast } = useToast();

  const { data: exportData, isLoading, refetch } = useQuery({
    queryKey: ['export-data', dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from('call_responses')
        .select(`
          *,
          patients (name, phone_number, nhs_number),
          calls (started_at, status)
        `)
        .order('collected_at', { ascending: false });
      
      if (dateFrom) {
        query = query.gte('collected_at', dateFrom);
      }
      if (dateTo) {
        query = query.lte('collected_at', dateTo + 'T23:59:59');
      }

      const { data, error } = await query;
      if (error) throw error;
      
      return data.map((item: any) => ({
        patient_name: item.patients?.name ?? '',
        patient_phone: item.patients?.phone_number ?? '',
        nhs_number: item.patients?.nhs_number ?? '',
        call_date: item.collected_at,
        weight_kg: item.weight_kg,
        height_cm: item.height_cm,
        smoking_status: item.smoking_status,
        alcohol_units_per_week: item.alcohol_units_per_week,
        blood_pressure_systolic: item.blood_pressure_systolic,
        blood_pressure_diastolic: item.blood_pressure_diastolic,
        pulse_rate: item.pulse_rate,
        is_carer: item.is_carer,
      })) as ExportableData[];
    },
    enabled: false,
  });

  const fieldLabels: Record<string, string> = {
    patient_name: 'Patient Name',
    patient_phone: 'Phone Number',
    nhs_number: 'NHS Number',
    call_date: 'Call Date',
    weight_kg: 'Weight (kg)',
    height_cm: 'Height (cm)',
    smoking_status: 'Smoking Status',
    alcohol_units_per_week: 'Alcohol (units/week)',
    blood_pressure_systolic: 'BP Systolic',
    blood_pressure_diastolic: 'BP Diastolic',
    pulse_rate: 'Pulse Rate',
    is_carer: 'Is Carer',
  };

  const toggleField = (field: string) => {
    if (selectedFields.includes(field)) {
      setSelectedFields(selectedFields.filter(f => f !== field));
    } else {
      setSelectedFields([...selectedFields, field]);
    }
  };

  const handlePreview = () => {
    refetch();
  };

  const handleExportCSV = () => {
    if (!exportData || exportData.length === 0) {
      toast({ variant: 'destructive', title: 'No data to export', description: 'Please preview the data first.' });
      return;
    }

    // Build CSV
    const headers = selectedFields.map(f => fieldLabels[f]).join(',');
    const rows = exportData.map(row => 
      selectedFields.map(field => {
        let value = row[field as keyof ExportableData];
        if (value === null || value === undefined) return '';
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (field === 'call_date' && typeof value === 'string') {
          return new Date(value).toISOString().split('T')[0];
        }
        // Escape commas and quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    ).join('\n');

    const csv = `${headers}\n${rows}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `patient-health-data-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    logAction('export', 'export', undefined, { 
      record_count: exportData.length, 
      fields: selectedFields,
      date_range: { from: dateFrom, to: dateTo }
    });

    toast({ title: 'Export complete', description: `${exportData.length} records exported to CSV` });
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Export Data</h1>
        <p className="text-muted-foreground mt-1">Export collected health data for EMIS Web import</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Filters */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Date Range
              </CardTitle>
              <CardDescription>Filter by call date</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="date-from">From</Label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date-to">To</Label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Fields to Export
              </CardTitle>
              <CardDescription>Select which fields to include</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(fieldLabels).map(([field, label]) => (
                  <div key={field} className="flex items-center space-x-2">
                    <Checkbox
                      id={field}
                      checked={selectedFields.includes(field)}
                      onCheckedChange={() => toggleField(field)}
                    />
                    <label htmlFor={field} className="text-sm cursor-pointer">
                      {label}
                    </label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Button onClick={handlePreview} variant="outline" className="w-full">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Preview Data
            </Button>
            <Button onClick={handleExportCSV} className="w-full" disabled={!exportData?.length}>
              <Download className="h-4 w-4 mr-2" />
              Export to CSV
            </Button>
          </div>
        </div>

        {/* Preview */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Data Preview</CardTitle>
              <CardDescription>
                {exportData ? `${exportData.length} records found` : 'Click "Preview Data" to load records'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : exportData && exportData.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {selectedFields.map(field => (
                          <TableHead key={field}>{fieldLabels[field]}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exportData.slice(0, 10).map((row, idx) => (
                        <TableRow key={idx}>
                          {selectedFields.map(field => (
                            <TableCell key={field}>
                              {(() => {
                                const value = row[field as keyof ExportableData];
                                if (value === null || value === undefined) return '-';
                                if (typeof value === 'boolean') return value ? 'Yes' : 'No';
                                if (field === 'call_date' && typeof value === 'string') {
                                  return new Date(value).toLocaleDateString('en-GB');
                                }
                                return String(value);
                              })()}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {exportData.length > 10 && (
                    <p className="text-sm text-muted-foreground text-center mt-4">
                      Showing first 10 of {exportData.length} records
                    </p>
                  )}
                </div>
              ) : exportData && exportData.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No data found for the selected filters.
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Select your filters and click "Preview Data" to see exportable records.
                </div>
              )}
            </CardContent>
          </Card>

          {/* EMIS Integration Note */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>EMIS Web Integration</CardTitle>
              <CardDescription>How to import this data into EMIS Web</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Export the data as CSV using the button above</li>
                <li>Open EMIS Web and navigate to Data Import</li>
                <li>Select the exported CSV file</li>
                <li>Map the columns to the corresponding EMIS fields</li>
                <li>Review and confirm the import</li>
              </ol>
              <p className="text-sm text-muted-foreground mt-4 p-3 bg-muted rounded-lg">
                <strong>Note:</strong> Direct API integration with EMIS Web is planned for a future update. 
                For now, please use the CSV export method.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
