// @ts-ignore
function processNode(node:HTMLElement, parentStyles = {}) {
    if (node.nodeType === Node.TEXT_NODE) {
        // @ts-ignore
        return node.textContent.trim() ? [node] : [];
    }

    if (node.nodeType !== Node.ELEMENT_NODE || node.tagName !== 'SPAN') {
        return [node.cloneNode(true)];
    }

    // 解析当前节点的样式
    const currentStyles = {};
    if (node.hasAttribute('style')) {
        // @ts-ignore
        node.getAttribute('style').split(';').forEach(style => {
            const [key, value] = style.split(':').map(s => s.trim());
            // @ts-ignore
            if (key && value) currentStyles[key] = value;
        });
    }

    // 合并样式（内层覆盖外层）
    const mergedStyles = { ...parentStyles, ...currentStyles };

    const children = Array.from(node.childNodes);
    // @ts-ignore
    const processedChildren = children.flatMap(child => processNode(child, mergedStyles));

    if (processedChildren.length === 0) {
        return [];
    }

    // 如果有样式或需要保留结构，创建新的span
    const hasOwnStyle = node.hasAttribute('style');
    // @ts-ignore
    const hasNestedSpan = processedChildren.some(child =>
        child.nodeType === Node.ELEMENT_NODE && child.tagName === 'SPAN');

    if (hasOwnStyle || hasNestedSpan) {
        const newSpan = document.createElement('span');
        // 只设置当前节点的样式，不继承（因为已经传递给子节点）
        if (hasOwnStyle) {
            // @ts-ignore
            newSpan.setAttribute('style', node.getAttribute('style'));
        }
        // @ts-ignore
        processedChildren.forEach(child => newSpan.appendChild(child));
        return [newSpan];
    } else {
        return processedChildren;
    }
}
// @ts-ignore
export function simplifySpansWithStyleMerge(html:string) {
    try{
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        // @ts-ignore

        // @ts-ignore
        const resultNodes = Array.from(tempDiv.childNodes).flatMap(node => processNode(node));
        const resultDiv = document.createElement('div');
        resultNodes.forEach(node => resultDiv.appendChild(<Node>node));
        return resultDiv.innerHTML;
    }
    catch (e) {
        console.error(e)
        return html
    }
}
