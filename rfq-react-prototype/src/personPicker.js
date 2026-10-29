// Personnel search is shared by single and multiple mention pickers.
export function filterPeople(people,query='') {
 const search=query.trim().replace(/^[@＠]\s*/,'').toLocaleLowerCase();
 return people.map(person=>({...person,id:person.userId||person.id}))
  .filter(person=>`${person.name} ${person.id}`.toLocaleLowerCase().includes(search));
}
