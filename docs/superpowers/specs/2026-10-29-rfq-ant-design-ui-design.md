# RFQ Ant Design UI migration

The user approved the concrete UI migration proposed in this chat. Keep the current React + Vite application, hash routes, local storage and all business callbacks. Adopt a compatible Ant Design / ProComponents combination in place, on `codex/rfq-ant-design-ui`.

Scope: consistent theme and overlay/empty/status/pagination components; ProTable for project list, tasks and analysis records; validated RFQ creation form; Ant Upload manual file selection; ID-based personnel Select and Mentions for comments; resizable source/response workspace with readable typography and Radio conclusion controls; ProLayout application navigation.

Preserve: project cards, capability/process selection and nested creation; qualified personnel candidates; manual upload metadata/version/replacement rules; source highlights and annotation geometry; unsaved-navigation guards; distinction between saving, confirming, reviewing and exporting; the existing final-review gate. No real upload, parsing, notifications or backend integration is added.

Use explicit status presentation mappings. Keep unavailable selected personnel visible as disabled values requiring reselection. Mentions record only valid IDs still present in final saved text. Scope legacy CSS so it does not override Ant controls. Small screens must remain usable.

Approach: staged component migration in the existing workspace on a dedicated branch, rather than replacing the application scaffold. This keeps the running local demonstration pointed at the changed code. Installed package peer dependencies decide the compatible major versions.

Validation: baseline domain suite (292 tests), new behavior tests for adaptation boundaries, production build, browser interaction checks for lists, creation, selection, upload, comments, dirty navigation, review/export permissions and responsive layout.
