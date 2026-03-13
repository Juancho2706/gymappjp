
create or replace function search_foods(search_term text)
returns setof foods
as $$
begin
  return query
    select *
    from foods
    where name ilike '%' || search_term || '%';
end;
$$ language plpgsql;
