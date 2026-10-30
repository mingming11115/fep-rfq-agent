import { Children, Fragment, isValidElement } from 'react';

// Preserve the existing business renderers and callbacks while Ant Table owns
// all DOM, spacing, hover, borders and accessibility for these tables.
export function tableChildren(children) {
  return Children.toArray(children).flatMap(child => isValidElement(child) && child.type === Fragment
    ? tableChildren(child.props.children) : isValidElement(child) ? [child] : []);
}
export function selectOptions(children) {
  const text = children => Children.toArray(children).map(child => isValidElement(child)
    ? text(child.props.children) : String(child)).join('');
  return tableChildren(children).map(option => ({ value: String(option.props.value ?? text(option.props.children).replace(/\s+/g, ' ').trim()),
    label: option.props.children, disabled: option.props.disabled }));
}
export function tableData(children) {
  const sections = tableChildren(children);
  const head = sections.find(child => child.type === 'thead');
  const body = sections.find(child => child.type === 'tbody');
  const headers = tableChildren(tableChildren(head?.props.children)[0]?.props.children);
  const dataSource = tableChildren(body?.props.children).map((row, index) => {
    const { children: cells, ...rowProps } = row.props;
    const values = [];
    tableChildren(cells).forEach(cell => {
      const { children: content, ...props } = cell.props;
      values.push({ content, props });
      for (let i = 1; i < (props.colSpan || 1); i++) values.push({ content: null, props: { colSpan: 0 } });
    });
    return { key: row.key?.replace(/^\.\$/, '') || String(index), cells: values, rowProps };
  });
  const columns = headers.map((header, index) => ({
    key: String(index), title: header.props.children,
    render: (_, row) => row.cells[index]?.content,
    onCell: row => row.cells[index]?.props || {},
  }));
  return { columns, dataSource, onRow: row => row.rowProps };
}
