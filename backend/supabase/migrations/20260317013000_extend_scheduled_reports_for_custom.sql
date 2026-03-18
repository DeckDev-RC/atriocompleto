-- Extend scheduled reports to support custom report definitions.

ALTER TABLE public.scheduled_reports
  ADD COLUMN IF NOT EXISTS custom_report_id UUID REFERENCES public.custom_report_definitions(id) ON DELETE SET NULL;

ALTER TABLE public.scheduled_reports
  DROP CONSTRAINT IF EXISTS scheduled_reports_report_type_check;

ALTER TABLE public.scheduled_reports
  ADD CONSTRAINT scheduled_reports_report_type_check
    CHECK (report_type IN ('sales', 'products', 'customers', 'finance', 'custom'));

ALTER TABLE public.scheduled_reports
  DROP CONSTRAINT IF EXISTS scheduled_reports_custom_report_required_check;

ALTER TABLE public.scheduled_reports
  ADD CONSTRAINT scheduled_reports_custom_report_required_check
    CHECK (
      (report_type = 'custom' AND custom_report_id IS NOT NULL)
      OR (report_type <> 'custom')
    );

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_custom_report
  ON public.scheduled_reports(custom_report_id);
