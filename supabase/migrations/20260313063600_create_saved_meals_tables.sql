
create table "public"."saved_meals" (
    "id" uuid not null default gen_random_uuid(),
    "coach_id" uuid not null,
    "name" text not null,
    constraint "saved_meals_pkey" primary key ("id"),
    constraint "saved_meals_coach_id_fkey" foreign key ("coach_id") references "public"."coaches" ("id")
);

create table "public"."saved_meal_items" (
    "id" uuid not null default gen_random_uuid(),
    "saved_meal_id" uuid not null,
    "food_id" uuid not null,
    "quantity" integer not null,
    constraint "saved_meal_items_pkey" primary key ("id"),
    constraint "saved_meal_items_saved_meal_id_fkey" foreign key ("saved_meal_id") references "public"."saved_meals" ("id") on delete cascade,
    constraint "saved_meal_items_food_id_fkey" foreign key ("food_id") references "public"."foods" ("id") on delete cascade
);
