-- P2.4: track previous Mercado Pago preapproval to cancel when the new one is authorized
alter table public.coaches
  add column if not exists superseded_mp_preapproval_id text null;

-- ---------------------------------------------------------------------------
-- Row Level Security (public schema)
-- Service role bypasses RLS. Authenticated coach/client use createClient().
-- Each block is skipped if the table does not exist (schemas may differ per project).
-- ---------------------------------------------------------------------------

-- coaches (required core table)
alter table public.coaches enable row level security;

drop policy if exists coaches_select_anon on public.coaches;
create policy coaches_select_anon on public.coaches for select to anon using (true);

drop policy if exists coaches_select_authenticated on public.coaches;
create policy coaches_select_authenticated on public.coaches for select to authenticated using (
  id = (select auth.uid())
  or exists (select 1 from public.clients c where c.id = (select auth.uid()) and c.coach_id = coaches.id)
);

drop policy if exists coaches_update_own on public.coaches;
create policy coaches_update_own on public.coaches for update to authenticated using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- clients
do $rls$
begin
  if to_regclass('public.clients') is not null then
    alter table public.clients enable row level security;
    drop policy if exists clients_coach_all on public.clients;
    create policy clients_coach_all on public.clients for all to authenticated using (coach_id = (select auth.uid()))
    with check (coach_id = (select auth.uid()));
    drop policy if exists clients_self_select on public.clients;
    create policy clients_self_select on public.clients for select to authenticated using (id = (select auth.uid()));
    drop policy if exists clients_self_update on public.clients;
    create policy clients_self_update on public.clients for update to authenticated using (id = (select auth.uid()))
    with check (id = (select auth.uid()));
  end if;
end $rls$;

-- subscription_events
do $rls$
begin
  if to_regclass('public.subscription_events') is not null then
    alter table public.subscription_events enable row level security;
    drop policy if exists subscription_events_coach on public.subscription_events;
    create policy subscription_events_coach on public.subscription_events for select to authenticated using (
      coach_id = (select auth.uid())
    );
  end if;
end $rls$;

-- check_ins
do $rls$
begin
  if to_regclass('public.check_ins') is not null then
    alter table public.check_ins enable row level security;
    drop policy if exists check_ins_coach on public.check_ins;
    create policy check_ins_coach on public.check_ins for all to authenticated using (
      exists (select 1 from public.clients c where c.id = check_ins.client_id and c.coach_id = (select auth.uid()))
    )
    with check (
      exists (select 1 from public.clients c where c.id = check_ins.client_id and c.coach_id = (select auth.uid()))
    );
    drop policy if exists check_ins_client on public.check_ins;
    create policy check_ins_client on public.check_ins for all to authenticated using (client_id = (select auth.uid()))
    with check (client_id = (select auth.uid()));
  end if;
end $rls$;

-- client_intake
do $rls$
begin
  if to_regclass('public.client_intake') is not null then
    alter table public.client_intake enable row level security;
    drop policy if exists client_intake_coach on public.client_intake;
    create policy client_intake_coach on public.client_intake for all to authenticated using (
      exists (select 1 from public.clients c where c.id = client_intake.client_id and c.coach_id = (select auth.uid()))
    )
    with check (
      exists (select 1 from public.clients c where c.id = client_intake.client_id and c.coach_id = (select auth.uid()))
    );
    drop policy if exists client_intake_client on public.client_intake;
    create policy client_intake_client on public.client_intake for all to authenticated using (client_id = (select auth.uid()))
    with check (client_id = (select auth.uid()));
  end if;
end $rls$;

-- client_payments (optional — not present on all Supabase projects)
do $rls$
begin
  if to_regclass('public.client_payments') is not null then
    alter table public.client_payments enable row level security;
    drop policy if exists client_payments_coach on public.client_payments;
    create policy client_payments_coach on public.client_payments for all to authenticated using (
      coach_id = (select auth.uid())
    )
    with check (coach_id = (select auth.uid()));
    drop policy if exists client_payments_client on public.client_payments;
    create policy client_payments_client on public.client_payments for select to authenticated using (
      client_id = (select auth.uid())
    );
  end if;
end $rls$;

-- daily_nutrition_logs
do $rls$
begin
  if to_regclass('public.daily_nutrition_logs') is not null then
    alter table public.daily_nutrition_logs enable row level security;
    drop policy if exists daily_nutrition_logs_coach on public.daily_nutrition_logs;
    create policy daily_nutrition_logs_coach on public.daily_nutrition_logs for all to authenticated using (
      exists (select 1 from public.clients c where c.id = daily_nutrition_logs.client_id and c.coach_id = (select auth.uid()))
    )
    with check (
      exists (select 1 from public.clients c where c.id = daily_nutrition_logs.client_id and c.coach_id = (select auth.uid()))
    );
    drop policy if exists daily_nutrition_logs_client on public.daily_nutrition_logs;
    create policy daily_nutrition_logs_client on public.daily_nutrition_logs for all to authenticated using (
      client_id = (select auth.uid())
    )
    with check (client_id = (select auth.uid()));
  end if;
end $rls$;

-- exercises
do $rls$
begin
  if to_regclass('public.exercises') is not null then
    alter table public.exercises enable row level security;
    drop policy if exists exercises_read on public.exercises;
    create policy exercises_read on public.exercises for select to authenticated using (
      coach_id is null or coach_id = (select auth.uid())
    );
    drop policy if exists exercises_write_own on public.exercises;
    create policy exercises_write_own on public.exercises for all to authenticated using (coach_id = (select auth.uid()))
    with check (coach_id = (select auth.uid()));
  end if;
end $rls$;

-- foods
do $rls$
begin
  if to_regclass('public.foods') is not null then
    alter table public.foods enable row level security;
    drop policy if exists foods_read on public.foods;
    create policy foods_read on public.foods for select to authenticated using (
      coach_id is null or coach_id = (select auth.uid())
    );
    drop policy if exists foods_write_own on public.foods;
    create policy foods_write_own on public.foods for all to authenticated using (
      coach_id is not null and coach_id = (select auth.uid())
    )
    with check (coach_id is not null and coach_id = (select auth.uid()));
  end if;
end $rls$;

-- nutrition_plan_templates
do $rls$
begin
  if to_regclass('public.nutrition_plan_templates') is not null then
    alter table public.nutrition_plan_templates enable row level security;
    drop policy if exists nutrition_plan_templates_coach on public.nutrition_plan_templates;
    create policy nutrition_plan_templates_coach on public.nutrition_plan_templates for all to authenticated using (
      coach_id = (select auth.uid())
    )
    with check (coach_id = (select auth.uid()));
  end if;
end $rls$;

-- nutrition_plans
do $rls$
begin
  if to_regclass('public.nutrition_plans') is not null then
    alter table public.nutrition_plans enable row level security;
    drop policy if exists nutrition_plans_coach on public.nutrition_plans;
    create policy nutrition_plans_coach on public.nutrition_plans for all to authenticated using (
      coach_id = (select auth.uid())
    )
    with check (coach_id = (select auth.uid()));
    drop policy if exists nutrition_plans_client on public.nutrition_plans;
    create policy nutrition_plans_client on public.nutrition_plans for select to authenticated using (
      client_id = (select auth.uid())
    );
  end if;
end $rls$;

-- nutrition_meals
do $rls$
begin
  if to_regclass('public.nutrition_meals') is not null then
    alter table public.nutrition_meals enable row level security;
    drop policy if exists nutrition_meals_access on public.nutrition_meals;
    create policy nutrition_meals_access on public.nutrition_meals for all to authenticated using (
      exists (
        select 1 from public.nutrition_plans p
        where p.id = nutrition_meals.plan_id
          and (p.coach_id = (select auth.uid()) or p.client_id = (select auth.uid()))
      )
    )
    with check (
      exists (
        select 1 from public.nutrition_plans p
        where p.id = nutrition_meals.plan_id
          and (p.coach_id = (select auth.uid()) or p.client_id = (select auth.uid()))
      )
    );
  end if;
end $rls$;

-- food_items
do $rls$
begin
  if to_regclass('public.food_items') is not null then
    alter table public.food_items enable row level security;
    drop policy if exists food_items_access on public.food_items;
    create policy food_items_access on public.food_items for all to authenticated using (
      exists (
        select 1 from public.nutrition_meals m
        join public.nutrition_plans p on p.id = m.plan_id
        where m.id = food_items.meal_id
          and (p.coach_id = (select auth.uid()) or p.client_id = (select auth.uid()))
      )
    )
    with check (
      exists (
        select 1 from public.nutrition_meals m
        join public.nutrition_plans p on p.id = m.plan_id
        where m.id = food_items.meal_id
          and (p.coach_id = (select auth.uid()) or p.client_id = (select auth.uid()))
      )
    );
  end if;
end $rls$;

-- nutrition_meal_logs
do $rls$
begin
  if to_regclass('public.nutrition_meal_logs') is not null then
    alter table public.nutrition_meal_logs enable row level security;
    drop policy if exists nutrition_meal_logs_access on public.nutrition_meal_logs;
    create policy nutrition_meal_logs_access on public.nutrition_meal_logs for all to authenticated using (
      exists (
        select 1 from public.daily_nutrition_logs d
        where d.id = nutrition_meal_logs.daily_log_id
          and (
            d.client_id = (select auth.uid())
            or exists (select 1 from public.clients c where c.id = d.client_id and c.coach_id = (select auth.uid()))
          )
      )
    )
    with check (
      exists (
        select 1 from public.daily_nutrition_logs d
        where d.id = nutrition_meal_logs.daily_log_id
          and (
            d.client_id = (select auth.uid())
            or exists (select 1 from public.clients c where c.id = d.client_id and c.coach_id = (select auth.uid()))
          )
      )
    );
  end if;
end $rls$;

-- saved_meals
do $rls$
begin
  if to_regclass('public.saved_meals') is not null then
    alter table public.saved_meals enable row level security;
    drop policy if exists saved_meals_coach on public.saved_meals;
    create policy saved_meals_coach on public.saved_meals for all to authenticated using (coach_id = (select auth.uid()))
    with check (coach_id = (select auth.uid()));
  end if;
end $rls$;

-- saved_meal_items
do $rls$
begin
  if to_regclass('public.saved_meal_items') is not null then
    alter table public.saved_meal_items enable row level security;
    drop policy if exists saved_meal_items_access on public.saved_meal_items;
    create policy saved_meal_items_access on public.saved_meal_items for all to authenticated using (
      exists (select 1 from public.saved_meals s where s.id = saved_meal_items.saved_meal_id and s.coach_id = (select auth.uid()))
    )
    with check (
      exists (select 1 from public.saved_meals s where s.id = saved_meal_items.saved_meal_id and s.coach_id = (select auth.uid()))
    );
  end if;
end $rls$;

-- template_meals
do $rls$
begin
  if to_regclass('public.template_meals') is not null then
    alter table public.template_meals enable row level security;
    drop policy if exists template_meals_access on public.template_meals;
    create policy template_meals_access on public.template_meals for all to authenticated using (
      exists (
        select 1 from public.nutrition_plan_templates t
        where t.id = template_meals.template_id and t.coach_id = (select auth.uid())
      )
    )
    with check (
      exists (
        select 1 from public.nutrition_plan_templates t
        where t.id = template_meals.template_id and t.coach_id = (select auth.uid())
      )
    );
  end if;
end $rls$;

-- template_meal_groups
do $rls$
begin
  if to_regclass('public.template_meal_groups') is not null then
    alter table public.template_meal_groups enable row level security;
    drop policy if exists template_meal_groups_access on public.template_meal_groups;
    create policy template_meal_groups_access on public.template_meal_groups for all to authenticated using (
      exists (
        select 1 from public.template_meals tm
        join public.nutrition_plan_templates t on t.id = tm.template_id
        where tm.id = template_meal_groups.template_meal_id and t.coach_id = (select auth.uid())
      )
    )
    with check (
      exists (
        select 1 from public.template_meals tm
        join public.nutrition_plan_templates t on t.id = tm.template_id
        where tm.id = template_meal_groups.template_meal_id and t.coach_id = (select auth.uid())
      )
    );
  end if;
end $rls$;

-- recipes
do $rls$
begin
  if to_regclass('public.recipes') is not null then
    alter table public.recipes enable row level security;
    drop policy if exists recipes_read on public.recipes;
    create policy recipes_read on public.recipes for select to authenticated using (
      coach_id is null or coach_id = (select auth.uid())
    );
    drop policy if exists recipes_write_own on public.recipes;
    create policy recipes_write_own on public.recipes for all to authenticated using (
      coach_id is not null and coach_id = (select auth.uid())
    )
    with check (coach_id is not null and coach_id = (select auth.uid()));
  end if;
end $rls$;

-- recipe_ingredients
do $rls$
begin
  if to_regclass('public.recipe_ingredients') is not null then
    alter table public.recipe_ingredients enable row level security;
    drop policy if exists recipe_ingredients_access on public.recipe_ingredients;
    drop policy if exists recipe_ingredients_select on public.recipe_ingredients;
    drop policy if exists recipe_ingredients_insert on public.recipe_ingredients;
    drop policy if exists recipe_ingredients_update on public.recipe_ingredients;
    drop policy if exists recipe_ingredients_delete on public.recipe_ingredients;
    create policy recipe_ingredients_select on public.recipe_ingredients for select to authenticated using (
      exists (
        select 1 from public.recipes r
        where r.id = recipe_ingredients.recipe_id
          and (r.coach_id is null or r.coach_id = (select auth.uid()))
      )
    );
    create policy recipe_ingredients_insert on public.recipe_ingredients for insert to authenticated with check (
      exists (select 1 from public.recipes r where r.id = recipe_ingredients.recipe_id and r.coach_id = (select auth.uid()))
    );
    create policy recipe_ingredients_update on public.recipe_ingredients for update to authenticated using (
      exists (select 1 from public.recipes r where r.id = recipe_ingredients.recipe_id and r.coach_id = (select auth.uid()))
    )
    with check (
      exists (select 1 from public.recipes r where r.id = recipe_ingredients.recipe_id and r.coach_id = (select auth.uid()))
    );
    create policy recipe_ingredients_delete on public.recipe_ingredients for delete to authenticated using (
      exists (select 1 from public.recipes r where r.id = recipe_ingredients.recipe_id and r.coach_id = (select auth.uid()))
    );
  end if;
end $rls$;

-- workout_programs
do $rls$
begin
  if to_regclass('public.workout_programs') is not null then
    alter table public.workout_programs enable row level security;
    drop policy if exists workout_programs_coach on public.workout_programs;
    create policy workout_programs_coach on public.workout_programs for all to authenticated using (
      coach_id = (select auth.uid())
    )
    with check (coach_id = (select auth.uid()));
    drop policy if exists workout_programs_client_read on public.workout_programs;
    create policy workout_programs_client_read on public.workout_programs for select to authenticated using (
      client_id is not null and client_id = (select auth.uid())
    );
  end if;
end $rls$;

-- workout_plans
do $rls$
begin
  if to_regclass('public.workout_plans') is not null then
    alter table public.workout_plans enable row level security;
    drop policy if exists workout_plans_coach on public.workout_plans;
    create policy workout_plans_coach on public.workout_plans for all to authenticated using (
      coach_id = (select auth.uid())
    )
    with check (coach_id = (select auth.uid()));
    drop policy if exists workout_plans_client_read on public.workout_plans;
    create policy workout_plans_client_read on public.workout_plans for select to authenticated using (
      client_id is not null and client_id = (select auth.uid())
    );
  end if;
end $rls$;

-- workout_blocks
do $rls$
begin
  if to_regclass('public.workout_blocks') is not null then
    alter table public.workout_blocks enable row level security;
    drop policy if exists workout_blocks_access on public.workout_blocks;
    create policy workout_blocks_access on public.workout_blocks for all to authenticated using (
      exists (
        select 1 from public.workout_plans wp
        where wp.id = workout_blocks.plan_id
          and (wp.coach_id = (select auth.uid()) or (wp.client_id is not null and wp.client_id = (select auth.uid())))
      )
    )
    with check (
      exists (
        select 1 from public.workout_plans wp
        where wp.id = workout_blocks.plan_id
          and (wp.coach_id = (select auth.uid()) or (wp.client_id is not null and wp.client_id = (select auth.uid())))
      )
    );
  end if;
end $rls$;

-- workout_logs
do $rls$
begin
  if to_regclass('public.workout_logs') is not null then
    alter table public.workout_logs enable row level security;
    drop policy if exists workout_logs_coach on public.workout_logs;
    create policy workout_logs_coach on public.workout_logs for all to authenticated using (
      exists (select 1 from public.clients c where c.id = workout_logs.client_id and c.coach_id = (select auth.uid()))
    )
    with check (
      exists (select 1 from public.clients c where c.id = workout_logs.client_id and c.coach_id = (select auth.uid()))
    );
    drop policy if exists workout_logs_client on public.workout_logs;
    create policy workout_logs_client on public.workout_logs for all to authenticated using (client_id = (select auth.uid()))
    with check (client_id = (select auth.uid()));
  end if;
end $rls$;
