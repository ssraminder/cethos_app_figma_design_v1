-- Regional target-language variants used by RWS COA linguistic-validation work.
-- Target-only (is_source_available=false); mirror the base language's tier/multiplier/tier_id.
insert into languages (id, code, name, tier, multiplier, is_source_available, is_target_available, is_active, sort_order, tier_id)
select gen_random_uuid(), v.code, v.name, v.tier, v.mult, false, true, true, v.sort, v.tier_id
from (values
  ('en-IN','English (India)',1,1::numeric,103,'6f546576-deb4-4055-bf03-dfcef9f1ee31'::uuid),
  ('pa-IN','Punjabi (India)',4,0.9::numeric,104,'fc603fe8-b291-45b0-a497-871b8c5ee17c'::uuid),
  ('ta-SG','Tamil (Singapore)',1,1::numeric,105,'6f546576-deb4-4055-bf03-dfcef9f1ee31'::uuid),
  ('hi-IN','Hindi (India)',4,0.9::numeric,106,'fc603fe8-b291-45b0-a497-871b8c5ee17c'::uuid),
  ('mr-IN','Marathi (India)',1,1::numeric,107,'6f546576-deb4-4055-bf03-dfcef9f1ee31'::uuid),
  ('ta-IN','Tamil (India)',1,1::numeric,108,'6f546576-deb4-4055-bf03-dfcef9f1ee31'::uuid),
  ('ta-MY','Tamil (Malaysia)',1,1::numeric,109,'6f546576-deb4-4055-bf03-dfcef9f1ee31'::uuid)
) as v(code,name,tier,mult,sort,tier_id)
where not exists (select 1 from languages l where l.code=v.code);
