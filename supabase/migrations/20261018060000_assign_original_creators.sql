-- Who suggested the original spreadsheet activities (so they can edit them). Safe to re-run.
update public.places p set created_by = m.id
from (values
  ('Sanrio Puroland', 'Maryam'),
  ('Art Aquarium Museum', 'Maryam'),
  ('Super Nintendo World', 'Imraan'),
  ('Fuji Go Q tours & glamping', 'Taufiq'),
  ('Kiyomizudera temple', 'Haroon')
) as v(place_name, member_name)
join public.members m on m.name = v.member_name
where p.name = v.place_name;

select p.name, m.name as added_by from public.places p left join public.members m on m.id = p.created_by order by p.created_at;
