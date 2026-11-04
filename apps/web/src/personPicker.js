// Personnel search is shared by single and multiple mention pickers.
export function getMentionSearch(query) {
 const match=query.match(/^\s*[@＠]([^@＠]*)$/u);
 return match?match[1]:null;
}

export function filterPeople(people,query='') {
 const search=query.trim().replace(/^[@＠]\s*/,'').toLocaleLowerCase();
 return people.map(person=>({...person,id:person.userId||person.id}))
  .filter(person=>`${person.name} ${person.id}`.toLocaleLowerCase().includes(search));
}
