
create table "public"."nutrition_plans" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "coach_id" uuid not null,
    "name" text not null,
    "daily_calories" integer null,
    "protein_g" integer null,
    "carbs_g" integer null,
    "fats_g" integer null,
    "instructions" text null,
    "is_active" boolean not null default false,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    constraint "nutrition_plans_pkey" primary key ("id"),
    constraint "nutrition_plans_client_id_fkey" foreign key ("client_id") references "public"."clients" ("id"),
    constraint "nutrition_plans_coach_id_fkey" foreign key ("coach_id") references "public"."coaches" ("id")
);

create table "public"."nutrition_meals" (
    "id" uuid not null default gen_random_uuid(),
    "plan_id" uuid not null,
    "name" text not null,
    "description" text not null,
    "order_index" integer not null default 0,
    "created_at" timestamp with time zone not null default now(),
    constraint "nutrition_meals_pkey" primary key ("id"),
    constraint "nutrition_meals_plan_id_fkey" foreign key ("plan_id") references "public"."nutrition_plans" ("id") on delete cascade
);

create table "public"."foods" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "serving_size_g" integer not null,
    "calories" integer not null,
    "protein_g" integer not null,
    "carbs_g" integer not null,
    "fats_g" integer not null,
    "coach_id" uuid null,
    constraint "foods_pkey" primary key ("id"),
    constraint "foods_coach_id_fkey" foreign key ("coach_id") references "public"."coaches" ("id")
);

create table "public"."food_items" (
    "id" uuid not null default gen_random_uuid(),
    "meal_id" uuid not null,
    "food_id" uuid not null,
    "quantity" integer not null,
    constraint "food_items_pkey" primary key ("id"),
    constraint "food_items_food_id_fkey" foreign key ("food_id") references "public"."foods" ("id"),
    constraint "food_items_meal_id_fkey" foreign key ("meal_id") references "public"."nutrition_meals" ("id") on delete cascade
);

