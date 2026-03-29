-- Public data for tryval — isolated schema on tv-client Supabase
-- F&B is the first domain; more will be added over time.

CREATE SCHEMA IF NOT EXISTS public_data;

-----------------------------------------------------------
-- Source registry & ingestion tracking
-----------------------------------------------------------

-- Every data source is registered here
CREATE TABLE public_data.sources (
  id              text PRIMARY KEY,                -- e.g. 'fnb-eating-establishments'
  domain          text NOT NULL DEFAULT 'fnb',     -- grouping: fnb, realestate, labor, etc.
  name            text NOT NULL,
  description     text,
  api_type        text NOT NULL,                   -- datagov | singstat | ura | mom_excel | custom
  api_config      jsonb NOT NULL DEFAULT '{}',     -- resource_id, table_id, search params, etc.
  target_table    text NOT NULL,                   -- schema-qualified: public_data.eating_establishments
  row_count       integer DEFAULT 0,
  last_synced_at  timestamptz,
  sync_status     text DEFAULT 'never',            -- never | running | success | error
  sync_error      text,
  refresh_frequency text DEFAULT 'monthly',        -- monthly | quarterly | annual | static
  priority        integer DEFAULT 2,               -- 1=P1, 2=P2, 3=P3
  enabled         boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Track every ingestion run
CREATE TABLE public_data.ingestion_log (
  id              serial PRIMARY KEY,
  source_id       text NOT NULL REFERENCES public_data.sources(id),
  rows_upserted   integer DEFAULT 0,
  rows_deleted    integer DEFAULT 0,
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz,
  duration_ms     integer,
  status          text DEFAULT 'running',          -- running | success | error
  error           text,
  metadata        jsonb DEFAULT '{}'               -- any extra info (api calls made, etc.)
);

CREATE INDEX idx_il_source ON public_data.ingestion_log(source_id);
CREATE INDEX idx_il_started ON public_data.ingestion_log(started_at DESC);

-----------------------------------------------------------
-- F&B Domain: P1 tables
-----------------------------------------------------------

-- 1. Licensed eating establishments (SFA/NEA) — ~36,700 rows
CREATE TABLE public_data.eating_establishments (
  id              serial PRIMARY KEY,
  licensee_name   text,
  licence_number  text UNIQUE NOT NULL,
  business_name   text,
  premises_address text,
  postal_code     text,
  planning_area   text,
  grade           text,
  demerit_points  integer,
  suspension_start date,
  suspension_end  date,
  lat             numeric,
  lng             numeric,
  licence_issued  date,
  licence_expiry  date,
  source          text DEFAULT 'nea',
  fetched_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_ee_grade ON public_data.eating_establishments(grade);
CREATE INDEX idx_ee_planning_area ON public_data.eating_establishments(planning_area);
CREATE INDEX idx_ee_postal_code ON public_data.eating_establishments(postal_code);

-- 2. Hawker centres — ~120 rows
CREATE TABLE public_data.hawker_centres (
  id                    serial PRIMARY KEY,
  name                  text NOT NULL,
  address               text,
  postal_code           text,
  centre_type           text,
  owner                 text,
  total_stalls          integer,
  cooked_food_stalls    integer,
  market_produce_stalls integer,
  status                text,
  lat                   numeric,
  lng                   numeric,
  fetched_at            timestamptz DEFAULT now()
);

-- 3. F&B Services Index (monthly revenue index, 2017=100)
CREATE TABLE public_data.fnb_services_index (
  id                  serial PRIMARY KEY,
  period              date NOT NULL,
  series              text NOT NULL,
  index_value         numeric,
  seasonally_adjusted boolean DEFAULT false,
  fetched_at          timestamptz DEFAULT now(),
  UNIQUE(period, series, seasonally_adjusted)
);

CREATE INDEX idx_fsi_period ON public_data.fnb_services_index(period);

-- 4. Estimated F&B sales value (monthly, SGD millions)
CREATE TABLE public_data.fnb_sales_value (
  id              serial PRIMARY KEY,
  period          date NOT NULL,
  series          text NOT NULL,
  value_million_sgd numeric,
  fetched_at      timestamptz DEFAULT now(),
  UNIQUE(period, series)
);

-- 5. CPI for food service categories (monthly, 2024=100)
CREATE TABLE public_data.cpi_food_services (
  id              serial PRIMARY KEY,
  period          date NOT NULL,
  series          text NOT NULL,
  series_code     text,
  index_value     numeric,
  fetched_at      timestamptz DEFAULT now(),
  UNIQUE(period, series)
);

-----------------------------------------------------------
-- F&B Domain: P2 tables
-----------------------------------------------------------

CREATE TABLE public_data.commercial_rental_index (
  id              serial PRIMARY KEY,
  quarter         text NOT NULL,
  property_type   text NOT NULL,
  index_value     numeric,
  fetched_at      timestamptz DEFAULT now(),
  UNIQUE(quarter, property_type)
);

CREATE TABLE public_data.business_formations (
  id              serial PRIMARY KEY,
  year            integer NOT NULL,
  ssic_code       text,
  ssic_description text,
  metric          text NOT NULL,
  count           integer,
  fetched_at      timestamptz DEFAULT now(),
  UNIQUE(year, ssic_code, metric)
);

CREATE TABLE public_data.tourism_arrivals (
  id              serial PRIMARY KEY,
  period          date NOT NULL,
  source_market   text NOT NULL,
  arrivals        integer,
  fetched_at      timestamptz DEFAULT now(),
  UNIQUE(period, source_market)
);

CREATE TABLE public_data.occupational_wages (
  id                serial PRIMARY KEY,
  year              integer NOT NULL,
  occupation        text NOT NULL,
  industry          text DEFAULT 'Accommodation & Food Services',
  basic_wage_median numeric,
  basic_wage_25th   numeric,
  basic_wage_75th   numeric,
  gross_wage_median numeric,
  gross_wage_25th   numeric,
  gross_wage_75th   numeric,
  fetched_at        timestamptz DEFAULT now(),
  UNIQUE(year, occupation, industry)
);

CREATE TABLE public_data.employment_by_sector (
  id        serial PRIMARY KEY,
  period    date NOT NULL,
  frequency text NOT NULL,
  metric    text NOT NULL,
  sector    text NOT NULL,
  value     numeric,
  fetched_at timestamptz DEFAULT now(),
  UNIQUE(period, metric, sector)
);

-----------------------------------------------------------
-- F&B Domain: P3 tables
-----------------------------------------------------------

CREATE TABLE public_data.commercial_rental_transactions (
  id                serial PRIMARY KEY,
  street            text,
  project_name      text,
  property_type     text,
  district          text,
  area_sqft         numeric,
  rent_psf_month    numeric,
  lease_date        date,
  lease_term_months integer,
  fetched_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_crt_district ON public_data.commercial_rental_transactions(district);

CREATE TABLE public_data.population_by_area (
  id                serial PRIMARY KEY,
  planning_area     text NOT NULL,
  subzone           text,
  total_population  integer,
  male              integer,
  female            integer,
  census_year       integer DEFAULT 2020,
  fetched_at        timestamptz DEFAULT now(),
  UNIQUE(planning_area, subzone, census_year)
);

CREATE TABLE public_data.gdp_by_industry (
  id                serial PRIMARY KEY,
  year              integer NOT NULL,
  series            text NOT NULL,
  value_million_sgd numeric,
  fetched_at        timestamptz DEFAULT now(),
  UNIQUE(year, series)
);

-----------------------------------------------------------
-- Seed P1 sources
-----------------------------------------------------------

INSERT INTO public_data.sources (id, domain, name, description, api_type, api_config, target_table, refresh_frequency, priority) VALUES
  ('fnb-eating-establishments', 'fnb', 'Eating Establishments', 'NEA/SFA licensed F&B outlets with food safety grades and coordinates', 'datagov', '{"resource_id": "d_227473e811b09731e64725f140b77697", "geo_dataset_id": "d_1f0313499a17075d13aae6ed3e825bc6"}', 'public_data.eating_establishments', 'monthly', 1),
  ('fnb-hawker-centres', 'fnb', 'Hawker Centres', 'Government hawker centres and markets with stall counts', 'datagov', '{"geo_dataset_id": "d_4a086da0a5553be1d89383cd90d07ecd", "csv_resource_id": "d_68a42f09f350881996d83f9cd73ab02f"}', 'public_data.hawker_centres', 'quarterly', 1),
  ('fnb-services-index', 'fnb', 'F&B Services Index', 'Monthly revenue index for F&B sub-sectors (2017=100)', 'datagov', '{"resource_id": "d_d7933d23e5fab92a086585cfb9224ba2", "sa_resource_id": "d_ed77aee396f778d9166970cf826094fe"}', 'public_data.fnb_services_index', 'monthly', 1),
  ('fnb-sales-value', 'fnb', 'F&B Sales Value', 'Estimated monthly F&B sales in SGD millions', 'datagov', '{"resource_id": "d_73fe329d76ce493c14ee4cb70a7dbcdd"}', 'public_data.fnb_sales_value', 'monthly', 1),
  ('fnb-cpi', 'fnb', 'CPI Food Services', 'Consumer Price Index for food service categories (2024=100)', 'singstat', '{"table_id": "M213751", "search": "food beverage"}', 'public_data.cpi_food_services', 'monthly', 1),
  ('fnb-commercial-rental', 'fnb', 'Commercial Rental Index', 'URA quarterly rental index for retail/office space', 'datagov', '{"resource_id": "d_862c74b13138382b9f0c50c68d436b95"}', 'public_data.commercial_rental_index', 'quarterly', 2),
  ('fnb-business-formations', 'fnb', 'Business Formations', 'Annual F&B business registrations and closures by SSIC', 'singstat', '{"formation_table": "M085851", "cessation_table": "M085651", "search": "food beverage"}', 'public_data.business_formations', 'annual', 2),
  ('fnb-tourism-arrivals', 'fnb', 'Tourism Arrivals', 'Monthly international visitor arrivals by source market', 'datagov', '{"resource_id": "d_7e7b2ee60c6ffc962f80fef129cf306e"}', 'public_data.tourism_arrivals', 'monthly', 2),
  ('fnb-wages', 'fnb', 'Occupational Wages', 'Median wages for F&B occupations from MOM', 'mom_excel', '{"url": "https://stats.mom.gov.sg/Pages/Occupational-Wages-Tables2024.aspx"}', 'public_data.occupational_wages', 'annual', 2),
  ('fnb-employment', 'fnb', 'Employment by Sector', 'Workforce size and job vacancies for F&B sector', 'datagov', '{"resource_id": "d_d2518fed6cc2014f0cd061b4570a9592"}', 'public_data.employment_by_sector', 'quarterly', 2),
  ('fnb-rental-transactions', 'fnb', 'Rental Transactions', 'URA commercial rental transactions with rent PSF', 'ura', '{"note": "Requires URA API key registration"}', 'public_data.commercial_rental_transactions', 'quarterly', 3),
  ('fnb-population', 'fnb', 'Population by Area', 'Resident population by planning area from Census 2020', 'datagov', '{"resource_id": "d_d95ae740c0f8961a0b10435836660ce0"}', 'public_data.population_by_area', 'static', 3),
  ('fnb-gdp', 'fnb', 'GDP by Industry', 'GDP contribution of F&B sector', 'singstat', '{"table_id": "M015731", "search": "food"}', 'public_data.gdp_by_industry', 'annual', 3);
