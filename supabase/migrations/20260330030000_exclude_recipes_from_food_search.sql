
create or replace function search_foods(search_term text)
returns setof foods
as $$
begin
  return query
    select *
    from foods
    where name ilike '%' || search_term || '%'
    and name not ilike '[Receta]%';
end;
$$ language plpgsql;
