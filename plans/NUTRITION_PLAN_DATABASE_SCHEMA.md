# Nutrition Plan Database Schema Changes

This document outlines the proposed changes to the database schema to support the new nutrition features.

## New `foods` table

We will create a new table called `foods` to store information about food items.

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | Primary Key |
| `name` | `text` | Not Null |
| `serving_size_g` | `integer` | Not Null |
| `calories` | `integer` | Not Null |
| `protein_g` | `integer` | Not Null |
| `carbs_g` | `integer` | Not Null |
| `fats_g` | `integer` | Not Null |
| `coach_id` | `uuid` | Foreign Key to `coaches.id`, Nullable |

## New `food_items` table

We will create a new table called `food_items` to link foods to meals in a many-to-many relationship.

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | Primary Key |
| `meal_id` | `uuid` | Foreign Key to `nutrition_meals.id` |
| `food_id` | `uuid` | Foreign Key to `foods.id` |
| `quantity` | `integer` | Not Null |

