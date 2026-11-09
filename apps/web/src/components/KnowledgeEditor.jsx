import GroupPicker from './KnowledgeGroupContext';
import React, { useId, useRef } from 'react';
import { Modal, Select } from 'antd';
import { UiButton, UiInput, UiTextArea, UiSelect } from './AntContent';
import PersonPicker from './PersonPicker';
import {KNOWLEDGE_SOURCE_TYPES,changeKnowledgeSourceType} from '../knowledgeSources';
import { conditionTags, conditionText } from '../knowledgeConditions';
import './knowledge-editor.css';

function EditorField({ label, required = false, children }) {
  const generatedId = useId();
  const controlId = children.props.id || generatedId;
  // Keep compound controls outside the label so native label activation cannot
  // forward a second click to Select's internal input.
  return <div className="field knowledge-editor-field">
    <label htmlFor={controlId}>{label}{required && <b className="ref-required" aria-hidden="true"> *</b>}</label>
    {React.cloneElement(children, { id: controlId })}
  </div>;
}

export default function KnowledgeEditor({ form, isNew, error, onChange, onSave, onClose, sourceOptions = {documents:[],people:[]}, lockedSource=false, saving=false }) {
  const historical = form.type === 'history';
  const name = historical ? '历史 RFQ 知识' : '标准回复';
  const titleRef = useRef(null), requirementRef = useRef(null), answerRef = useRef(null);
  const change = (key, value) => onChange({ ...form, [key]: value });
  const invalid = key => Boolean(error && !form[key]?.trim());
  const save = () => {
    const missing = !form.title?.trim() ? titleRef : !form.requirement?.trim() ? requirementRef : !form.answer?.trim() ? answerRef : null;
    missing?.current?.focus();
    onSave();
  };

  return <Modal open centered width={800} onCancel={saving?undefined:onClose} maskClosable={!saving} closable={!saving}
    title={`${form.newVersion ? '修订' : isNew ? '新增' : '编辑'}${name}`}
    className="rfq-ant-modal knowledge-editor-modal"
    styles={{ body: { maxHeight: 'min(680px, calc(100dvh - 176px))', overflowY: 'auto' } }}
    footer={<><UiButton onClick={onClose} disabled={saving}>取消</UiButton><UiButton className="btn-primary" onClick={save} disabled={saving}>保存草稿</UiButton></>}>
    <div className="knowledge-editor">
      <p className="knowledge-editor-intro">{historical ? '记录历史项目的要求与最终答复。' : '整理可重复使用的客户要求与标准回复。'}保存后由 BU 管理员审核发布。</p>
      {error && <p className="knowledge-editor-error" role="alert">{error}</p>}
      {lockedSource?<p className="knowledge-editor-help">来源文件：{form.sourceFileName||form.source||'—'}{form.sourceRow? ` · 第 ${form.sourceRow} 行`:''}</p>:<>
      <GroupPicker value={form.groupIds||[]} onChange={groupIds=>change('groupIds',groupIds)}/><section className="knowledge-editor-source-section" aria-label="来源">
        <div className="knowledge-editor-source">
          <EditorField label="来源类型">
            <UiSelect aria-label="来源类型" value={form.sourceType || undefined} allowClear placeholder="请选择来源类型"
              onChange={e => onChange(changeKnowledgeSourceType(form,e.target.value))}>
              {KNOWLEDGE_SOURCE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
            </UiSelect>
          </EditorField>
          {form.sourceType === 'history-document' && <EditorField label="历史文档">
            <UiSelect aria-label="选择历史文档" value={form.sourceDocumentKey || undefined} allowClear showSearch optionFilterProp="label"
              placeholder="选择历史文档" notFoundContent="暂无可访问的历史文档" onChange={e => change('sourceDocumentKey',e.target.value || '')}>
              {sourceOptions.documents.map(doc => <option key={doc.value} value={doc.value}>{doc.label}</option>)}
              {form.sourceDocumentKey && !sourceOptions.documents.some(doc => doc.value === form.sourceDocumentKey) && <option value={form.sourceDocumentKey} disabled>{form.source || '原文档已不可用，请重新选择'}</option>}
            </UiSelect>
          </EditorField>}
          {form.sourceType === 'professional-confirmation' && <EditorField label="确认人员">
            <PersonPicker label="选择确认人员" people={sourceOptions.people} value={form.sourcePersonId || ''}
              resolveName={id => sourceOptions.people.find(person => person.id === id)?.name || form.sourcePersonName || id}
              emptyLabel="暂无可选的专业人员" onChange={id => change('sourcePersonId',id)}/>
          </EditorField>}
          {form.sourceType === 'enterprise-standard' && <EditorField label="口径说明">
            <UiTextArea aria-label="口径说明" rows={2} value={form.sourceStandardText || ''}
              onChange={e => change('sourceStandardText',e.target.value)} placeholder="填写企业标准名称、版本或具体口径"/>
          </EditorField>}
          {!form.sourceType && form.source && <p className="knowledge-editor-help knowledge-editor-legacy-source">原来源：{form.source}</p>}
        </div>
      </section></>}
      <section className="knowledge-editor-content" aria-label="回复内容">
        <EditorField label={historical ? '知识标题' : '回复标题'} required>
          <UiInput aria-label={historical ? '知识标题' : '回复标题'} aria-required="true" autoFocus ref={titleRef}
            aria-invalid={invalid('title') || undefined} status={invalid('title') ? 'error' : undefined}
            value={form.title || ''} onChange={e => change('title', e.target.value)}
            placeholder={historical ? '例如：某项目自动上料要求的处理经验' : '例如：300 mm 晶圆自动上料'}/>
        </EditorField>
        <EditorField label={historical ? '历史要求' : '客户要求'} required>
          <UiTextArea aria-label={historical ? '历史要求' : '客户要求'} aria-required="true" rows={2} ref={requirementRef}
            aria-invalid={invalid('requirement') || undefined} status={invalid('requirement') ? 'error' : undefined}
            value={form.requirement || ''} onChange={e => change('requirement', e.target.value)}
            placeholder="填写这条回复对应的要求或问题"/>
        </EditorField>
        <EditorField label={historical ? '最终答复' : '标准回复'} required>
          <UiTextArea aria-label={historical ? '最终答复' : '标准回复'} aria-required="true" rows={4} ref={answerRef}
            aria-invalid={invalid('answer') || undefined} status={invalid('answer') ? 'error' : undefined}
            value={form.answer || ''} onChange={e => change('answer', e.target.value)}
            placeholder={historical ? '填写历史项目最终采用的答复' : '填写可复用的答复，说明满足情况与必要条件'}/>
        </EditorField>
      </section>
      <section className="knowledge-editor-context" aria-label="适用范围">
        <EditorField label="适用条件">
          <Select aria-label="适用条件" className="knowledge-condition-tags" mode="tags" open={false}
            value={conditionTags(form.conditions)} onChange={values => change('conditions', conditionText(values))}
            tokenSeparators={['；', ';', '\n']} suffixIcon={null}
            placeholder="输入机型、配置、材料或工艺，按回车添加标签"/>
        </EditorField>
      </section>

    </div>
  </Modal>;
}
