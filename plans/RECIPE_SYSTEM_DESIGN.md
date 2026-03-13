# Recipe System Design

This document outlines the database schema, API integration strategy, and UI flow for the recipe management feature.

## 1. Database Schema

### `recipes` table

This table stores the core recipe information.

```sql
CREATE TABLE "public"."recipes" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "name" text NOT NULL,
    "instructions" text,
    "source_api" text,
    "source_api_id" text,
    "image_url" text,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "coach_id" uuid,
    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recipes_coach_id_fkey" FOREIGN KEY (coach_id) REFERENCES "public"."coaches" (id)
);
```

### `recipe_ingredients` table

This table links recipes to ingredients, referencing the existing `foods` table where possible.

```sql
CREATE TABLE "public"."recipe_ingredients" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "recipe_id" uuid NOT NULL,
    "food_id" uuid, -- Nullable, as not all ingredients might be in our DB
    "name" text NOT NULL, -- Ingredient name as provided by the API
    "quantity" numeric NOT NULL,
    "unit" text NOT NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY (recipe_id) REFERENCES "public"."recipes" (id) ON DELETE CASCADE,
    CONSTRAINT "recipe_ingredients_food_id_fkey" FOREIGN KEY (food_id) REFERENCES "public"."foods" (id) ON DELETE SET NULL
);
```

## 2. API Integration Strategy

We will use an external recipe API (e.g., Spoonacular or Edamam) to search for recipes.

1.  **Search**: The coach searches for recipes using a search bar in the UI. The frontend makes a request to our backend.
2.  **API Proxy**: Our backend forwards the search query to the external recipe API. This prevents exposing API keys on the client-side.
3.  **Display Results**: The backend returns the API search results to the frontend, which displays them to the coach.
4.  **Selection & Import**: When a coach selects a recipe to save, the frontend sends the recipe details (API ID, name, ingredients, etc.) to our backend.
5.  **Save to DB**:
    *   The backend creates a new record in the `recipes` table.
    *   For each ingredient in the recipe, the backend attempts to match it with an existing entry in the `foods` table (e.g., by name).
    *   If a match is found, the `food_id` is stored in the `recipe_ingredients` table.
    *   If no match is found, `food_id` is left `NULL`, and the ingredient name is saved as plain text. This allows for flexibility and future mapping.
    *   The new recipe and its ingredients are saved to the database.

## 3. UI Flow Description

1.  **Access**: The coach navigates to a new "Recipes" or "Meal Planner" section.
2.  **Search Interface**: A search bar allows the coach to search for recipes by keyword (e.g., "chicken breast and rice").
3.  **Recipe Results**: A list of recipes from the external API is displayed in a user-friendly format (e.g., cards with images and titles).
4.  **Recipe Details**: Clicking a recipe shows a detailed view, including ingredients, instructions, and nutritional information.
5.  **"Save Recipe" Button**: A button allows the coach to save the recipe to their local database.
6.  **Assign to Client**: Once saved, the coach can assign the recipe to a client's nutrition plan, similar to how they currently add individual foods or meals.
