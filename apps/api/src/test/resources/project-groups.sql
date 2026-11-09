insert ignore into knowledge_group_catalog (bu_id, payload) values ('BU-FEP', '{
  "buId":"BU-FEP",
  "writeRevision":3,
  "schema":{"levels":[{"id":"model","name":"机型"},{"id":"process","name":"工艺"}]},
  "nodes":[
    {"id":"TEST-MODEL","levelId":"model","name":"设备"},
    {"id":"TEST-PROCESS","levelId":"process","parentId":"TEST-MODEL","name":"工艺","values":{"code":"Si"}},
    {"id":"TEST-DISABLED","levelId":"model","name":"停用设备","enabled":false},
    {"id":"TEST-DISABLED-CHILD","levelId":"process","parentId":"TEST-DISABLED","name":"停用工艺"}
  ]
}');
