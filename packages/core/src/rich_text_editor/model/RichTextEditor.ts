// The initial version of this RTE was borrowed from https://github.com/jaredreich/pell
// and adapted to the GrapesJS's need

import { isString } from 'underscore';
import RichTextEditorModule from '..';
import EditorModel from '../../editor/model/Editor';
import { getPointerEvent, off, on } from '../../utils/dom';
import { getComponentModel } from '../../utils/mixins';
import {simplifySpansWithStyleMerge} from './utils';
export interface RichTextEditorAction {
  name: string;
  icon: string | HTMLElement;
  event?: string;
  attributes?: Record<string, any>;
  result: (rte: RichTextEditor, action: RichTextEditorAction) => void;
  update?: (rte: RichTextEditor, action: RichTextEditorAction) => number;
  state?: (rte: RichTextEditor, doc: Document) => number;
  btn?: HTMLElement;
  currentState?: RichTextEditorActionState;
}

export enum RichTextEditorActionState {
  ACTIVE = 1,
  INACTIVE = 0,
  DISABLED = -1,
}

export interface RichTextEditorOptions {
  actions?: (RichTextEditorAction | string)[];
  classes?: Record<string, string>;
  actionbar?: HTMLElement;
  actionbarContainer?: HTMLElement;
  styleWithCSS?: boolean;
  module?: RichTextEditorModule;
}

type EffectOptions = {
  event?: Event;
};

const RTE_KEY = '_rte';

const btnState = {
  ACTIVE: 1,
  INACTIVE: 0,
  DISABLED: -1,
};
const isValidTag = (rte: RichTextEditor, tagName = 'A') => {
  const { anchorNode, focusNode } = rte.selection() || {};
  const parentAnchor = anchorNode?.parentNode;
  const parentFocus = focusNode?.parentNode;
  return parentAnchor?.nodeName == tagName || parentFocus?.nodeName == tagName;
};

const customElAttr = 'data-selectme';

const defActions: Record<string, RichTextEditorAction> = {
  bold: {
    name: 'bold',
    icon: '<b>B</b>',
    attributes: { title: 'Bold' },
    result: (rte) => rte.exec('bold'),
  },
  italic: {
    name: 'italic',
    icon: '<i>I</i>',
    attributes: { title: 'Italic' },
    result: (rte) => rte.exec('italic'),
  },
  underline: {
    name: 'underline',
    icon: '<u>U</u>',
    attributes: { title: 'Underline' },
    result: (rte) => rte.exec('underline'),
  },
  strikethrough: {
    name: 'strikethrough',
    icon: '<s>S</s>',
    attributes: { title: 'Strike-through' },
    result: (rte) => rte.exec('strikeThrough'),
  },
  link: {
    // eslint-disable-next-line max-len
    icon: `<svg viewBox="0 0 24 24">
          <path fill="currentColor" d="M3.9,12C3.9,10.29 5.29,8.9 7,8.9H11V7H7A5,5 0 0,0 2,12A5,5 0 0,0 7,17H11V15.1H7C5.29,15.1 3.9,13.71 3.9,12M8,13H16V11H8V13M17,7H13V8.9H17C18.71,8.9 20.1,10.29 20.1,12C20.1,13.71 18.71,15.1 17,15.1H13V17H17A5,5 0 0,0 22,12A5,5 0 0,0 17,7Z" />
        </svg>`,
    name: 'link',
    attributes: {
      style: 'font-size:1.4rem;padding:0 4px 2px;',
      title: 'Link',
    },
    state: (rte) => {
      return rte && rte.selection() && isValidTag(rte) ? btnState.ACTIVE : btnState.INACTIVE;
    },
    result: (rte) => {
      if (isValidTag(rte)) {
        rte.exec('unlink');
      } else {
        rte.insertHTML(`<a href="" ${customElAttr}>${rte.selection()}</a>`, {
          select: true,
        });
      }
    },
  },
  wrap: {
    name: 'wrap',
    icon: `<svg viewBox="0 0 24 24">
            <path fill="currentColor" d="M20.71,4.63L19.37,3.29C19,2.9 18.35,2.9 17.96,3.29L9,12.25L11.75,15L20.71,6.04C21.1,5.65 21.1,5 20.71,4.63M7,14A3,3 0 0,0 4,17C4,18.31 2.84,19 2,19C2.92,20.22 4.5,21 6,21A4,4 0 0,0 10,17A3,3 0 0,0 7,14Z" />
        </svg>`,
    attributes: { title: 'Wrap for style' },
    state: (rte) => {
      return rte?.selection() && isValidTag(rte, 'SPAN') ? btnState.DISABLED : btnState.INACTIVE;
    },
    result: (rte) => {
      !isValidTag(rte, 'SPAN') &&
        rte.insertHTML(`<span ${customElAttr}>${rte.selection()}</span>`, {
          select: true,
        });
    },
  },
};

export default class RichTextEditor {
  em: EditorModel;
  settings: RichTextEditorOptions;
  classes!: Record<string, string>;
  actionbar?: HTMLElement;
  actions!: RichTextEditorAction[];
  el!: HTMLElement;
  doc!: Document;
  enabled?: boolean;
  getContent?: () => string;

  constructor(em: EditorModel, el: HTMLElement & { _rte?: RichTextEditor }, settings: RichTextEditorOptions = {}) {
    this.em = em;
    this.settings = settings;

    if (el[RTE_KEY]) {
      return el[RTE_KEY]!;
    }

    el[RTE_KEY] = this;
    this.setEl(el);
    this.updateActiveActions = this.updateActiveActions.bind(this);
    this.__onKeydown = this.__onKeydown.bind(this);
    this.__onPaste = this.__onPaste.bind(this);

    const acts = (settings.actions || []).map((action) => {
      let result = action;
      if (isString(action)) {
        result = { ...defActions[action] };
      } else if (defActions[action.name]) {
        result = { ...defActions[action.name], ...action };
      }
      return result as RichTextEditorAction;
    });
    const actions = acts.length ? acts : Object.keys(defActions).map((a) => defActions[a]);

    settings.classes = {
      actionbar: 'actionbar',
      button: 'action',
      active: 'active',
      disabled: 'disabled',
      inactive: 'inactive',
      ...settings.classes,
    };

    const classes = settings.classes;
    let actionbar = settings.actionbar;
    this.actionbar = actionbar!;
    this.classes = classes;
    this.actions = actions;

    if (!actionbar) {
      if (!this.isCustom(settings.module)) {
        const actionbarCont = settings.actionbarContainer;
        actionbar = document.createElement('div');
        actionbar.className = classes.actionbar;
        actionbarCont?.appendChild(actionbar);
        this.actionbar = actionbar;
      }
      actions.forEach((action) => this.addAction(action));
    }

    settings.styleWithCSS && this.exec('styleWithCSS');
    return this;
  }

  isCustom(module?: RichTextEditorModule) {
    const rte = module || this.em.RichTextEditor;
    return !!(rte?.config.custom || rte?.customRte);
  }

  destroy() {}

  setEl(el: HTMLElement) {
    this.el = el;
    this.doc = el.ownerDocument;

    // @ts-ignore setEl
    this?.em?._config?.richProps?.setEl?.(el.ownerDocument)
  }

  // 获取选区内容
  getSelectionVal():{htmlVal:string,displayText:string}{
    const selection: any = this.selection()
    const config:any={
      htmlVal:'',
      displayText: '',
    };
    if (selection) {
      try{
        if (selection.rangeCount) {
          // 获取选区中的文本内容
          config.displayText = selection.toString();
          try{
            let htmlVal = '';
            let container = this.doc.createElement('div');
            for (let i = 0, len = selection.rangeCount; i < len; ++i) {
              container.appendChild(selection.getRangeAt(i).cloneContents());
            }
            htmlVal = container.innerHTML;
            config.htmlVal = htmlVal;
          }
          catch (e){
            console.error(e)
          }
        }

      }
      catch (e){
        console.error(e)
      }
    }
    return config
  }

  // 删除选区内容
  delSelection(val:string){
    try{
      const selection: any = this.selection()
      if (!selection.rangeCount) return;

      const range = selection.getRangeAt(0);
      range.deleteContents();

      // Clear any remaining formatting
      const span = document.createElement('span');
      span.innerHTML = val||range.toString();
      range.insertNode(span);
      this.exec('removeFormat');
    }
    catch (e){
      console.warn(e)
    }
  }

  // @ts-ignore  向上查找 U 标签
  findUnderlineAction(currentNode:any):{isUnderLine:boolean}{
    try{
      if(currentNode?.tagName==='U'){
        return {
          isUnderLine:true,
        }
      }
      else if(currentNode?.tagName==='DIV'||currentNode?.tagName==='TD'){
        // 结束
        return {
          isUnderLine:false,
        }
      }
      else{
        // 向上查找
        return this.findUnderlineAction(currentNode.parentNode)
      }

    }
    catch (e){
      console.error(e)
      return {
        isUnderLine:false,
      }
    }
  }

  // @ts-ignore  向上查找 strike 标签
  findStrikeAction(currentNode:any):{isLineThrough:boolean}{
    try{
      if(currentNode?.tagName==='STRIKE'){
        return {
          isLineThrough:true,
        }
      }
      else if(currentNode?.tagName==='DIV'||currentNode?.tagName==='TD'){
        // 结束
        return {
          isLineThrough:false,
        }
      }
      else{
        // 向上查找
        return this.findStrikeAction(currentNode.parentNode)
      }

    }
    catch (e){
      console.error(e)
      return {
        isLineThrough:false,
      }
    }
  }

  // @ts-ignore  向上查找 b 标签
  findItalicAction(currentNode:any):{isItalic:boolean}{
    try{
      if(currentNode?.tagName==='I'){
        return {
          isItalic:true,
        }
      }
      else if(currentNode?.tagName==='DIV'||currentNode?.tagName==='TD'){
        // 结束
        return {
          isItalic:false,
        }
      }
      else{
        // 向上查找
        return this.findItalicAction(currentNode.parentNode)
      }

    }
    catch (e){
      console.error(e)
      return {
        isItalic:false,
      }
    }
  }

  // @ts-ignore  查找 getStyleAttrFromNode  查找单一属性
  getStyleAttrFromNode(currentNode:any,key:string):{value:any}{
    const fontDocStyle = currentNode?.getAttribute?.('style');
    let value=''
    if (fontDocStyle) {
      const styleArr = fontDocStyle.split(';');
      styleArr.some((styleStr:string) => {
        if (styleStr?.trim().startsWith(key)) {
          const styleStrVal = styleStr.split(':');
          // 字体
          value = styleStrVal[1].trim();
          return true
        }
      });
    }
    return {
      value:value
    };
  }

  // @ts-ignore  向上查找 font color
  findFontColorAction(currentNode:any):{color:string}{
    try{
      if(currentNode?.tagName==='FONT' && currentNode.getAttribute('color')){
        return {
          color:currentNode.getAttribute('color'),
        }
      }
      else if(currentNode?.tagName==='A'){
        return {
          color:this.getStyleAttrFromNode(currentNode,'color').value||'#0000ff'
        }
      }
      else if(currentNode?.tagName==='SPAN' && this.getStyleAttrFromNode(currentNode,'color').value){
        return {
          color:this.getStyleAttrFromNode(currentNode,'color').value
        }
      }
      else if(currentNode?.tagName==='DIV'||currentNode?.tagName==='TD'){
        // 结束
        return {
          color:this.getStyleAttrFromNode(currentNode,'color').value
        }
      }
      else if(currentNode?.parentNode){
        // 向上查找
        return this.findFontColorAction(currentNode.parentNode)
      }

    }
    catch (e){
      console.error(e)
      return {
        color:'',
      }
    }
  }

  // @ts-ignore 向下查找
  downFindFontColorAction(currentNode:HTMLElement):{color:string}{
    try{
      if(currentNode.nodeType===Node.ELEMENT_NODE){
        return {
          color:this.getStyleAttrFromNode(currentNode,'color').value
        }
        // 向下查找
        for (let i = 0; i < currentNode.childNodes.length; i++) {
          // @ts-ignore
          this.downFindFontColorAction(currentNode.childNodes[i]);
        }
      }
    }
    catch (e){
      console.error(e)
      return {
        color:'',
      }
    }
  }

  // @ts-ignore  向上查找 font background color
  findFontBackColorAction(currentNode:any):{backgroundColor:string}{
    try{
      if(currentNode?.tagName==='SPAN' && (this.getStyleAttrFromNode(currentNode,'background').value||this.getStyleAttrFromNode(currentNode,'background-color').value)){
        return {
          backgroundColor:this.getStyleAttrFromNode(currentNode,'background').value||this.getStyleAttrFromNode(currentNode,'background-color').value
        }
      }
      else if(currentNode?.tagName==='DIV'||currentNode?.tagName==='TD'){
        // 结束
        return {
          backgroundColor:this.getStyleAttrFromNode(currentNode,'background').value||this.getStyleAttrFromNode(currentNode,'background-color').value
        }
      }
      else{
        // 向上查找
        return this.findFontBackColorAction(currentNode.parentNode)
      }
    }
    catch (e){
      console.error(e)
      return {
        backgroundColor:'',
      }
    }
  }

  // @ts-ignore  向上查找 font family
  findFontFamilyAction(currentNode:any):{fontFamily:string}{
    try{
      if(currentNode?.tagName==='FONT' && currentNode.getAttribute('face')){
        return {
          fontFamily:currentNode.getAttribute('face'),
        }
      }
      else if(currentNode?.tagName==='SPAN' && this.getStyleAttrFromNode(currentNode,'font-family').value){
        return {
          fontFamily:this.getStyleAttrFromNode(currentNode,'font-family').value
        }
      }
      else if(currentNode?.tagName==='DIV'||currentNode?.tagName==='TD'){
        // 结束
        return {
          fontFamily:this.getStyleAttrFromNode(currentNode,'font-family').value
        }
      }
      else{
        // 向上查找
        return this.findFontFamilyAction(currentNode.parentNode)
      }

    }
    catch (e){
      console.error(e)
      return {
        fontFamily:'',
      }
    }
  }

  // @ts-ignore  向上查找 font size
  findFontSizeAction(currentNode:any):{fontsize:string}{
    try{
      if(currentNode?.tagName==='FONT' && currentNode.getAttribute('face')){
        return {
          fontsize:currentNode.getAttribute('size'),
        }
      }
      else if(currentNode?.tagName==='SPAN' && this.getStyleAttrFromNode(currentNode,'font-size').value){
        return {
          fontsize:this.getStyleAttrFromNode(currentNode,'font-size').value
        }
      }
      else if(currentNode?.tagName==='DIV'||currentNode?.tagName==='TD'){
        // 结束
        return {
          fontsize:this.getStyleAttrFromNode(currentNode,'font-size').value
        }
      }
      else{
        // 向上查找
        return this.findFontSizeAction(currentNode.parentNode)
      }

    }
    catch (e){
      console.error(e)
      return {
        fontsize:'',
      }
    }
  }

  // @ts-ignore  向上查找 b 标签
  findBoldAction(currentNode:any):{isBold:boolean}{
    try{
      if(currentNode?.tagName==='B'){
        return {
          isBold:true,
        }
      }
      else if(currentNode?.tagName==='DIV'||currentNode?.tagName==='TD'){
        // 结束
        return {
          isBold:false,
        }
      }
      else{
        // 向上查找
        return this.findBoldAction(currentNode.parentNode)
      }

    }
    catch (e){
      console.error(e)
      return {
        isBold:false,
      }
    }
  }
  // @ts-ignore  向上查找sub标签 下标
  findSubAction(currentNode:any):{isSub:boolean}{
    try{
      if(currentNode?.tagName==='SUB'){
        return {
          isSub:true,
        }
      }
      else if(currentNode?.tagName==='DIV'||currentNode?.tagName==='TD'){
        // 结束
        return {
          isSub:false,
        }
      }
      else{
        // 向上查找
        return this.findSubAction(currentNode.parentNode)
      }

    }
    catch (e){
      console.error(e)
      return {
        isSub:false,
      }
    }
  }
  // @ts-ignore  向上查找sup标签 上标
  findSupAction(currentNode:any):{isSup:boolean}{
    try{
      if(currentNode?.tagName==='SUP'){
        return {
          isSup:true,
        }
      }
      else if(currentNode?.tagName==='DIV'||currentNode?.tagName==='TD'){
        // 结束
        return {
          isSup:false,
        }
      }
      else{
        // 向上查找
        return this.findSupAction(currentNode.parentNode)
      }

    }
    catch (e){
      console.error(e)
      return {
        isSup:false,
      }
    }
  }

  // @ts-ignore  向上查找 a 标签
  findLinkAction(currentNode:any):{isLink:boolean,href?:any,target?:any}{
    try{
      if(currentNode?.tagName==='A'){
        return {
          isLink:true,
          href:currentNode.getAttribute('href'),
          target:currentNode.getAttribute('target'),
        }
      }
      else if(currentNode?.tagName==='DIV'||currentNode?.tagName==='TD'){
        // 结束
        return {isLink:false,href:'',target:''}
      }
      else{
        // 向上查找
        return this.findLinkAction(currentNode.parentNode)
      }

    }
    catch (e){
      console.error(e)
      return {isLink:false,href:'',target:''}
    }
  }

  // @ts-ignore  向上查找 a 标签 标记下划线
  findLinkUnderlineAction(currentNode:any):{isLink:boolean,href?:any,target?:any,isUnderLine?:any}{
    try{
      if(currentNode?.tagName==='A'){
        const styleStr = currentNode?.getAttribute('style');
        const styleStrArr = styleStr ? styleStr.split(';') : [];
        const styleConfig:any = {};
        styleStrArr.forEach((styleItem:any) => {
          const styleStrVal = styleItem.trim();
          if (styleStrVal) {
            const styleItemArr = styleStrVal.split(':');
            if (styleItemArr.length > 1) {
              const styleKey = styleItemArr[0].trim();
              const styleVal = styleItemArr[1].trim();
              styleConfig[styleKey]=styleVal
            }
          }
        });
        const key='text-decoration'
        const val='none'
        const isUnderLine=styleConfig[key]!==val
        return {
          isLink:true,
          href:currentNode.getAttribute('href'),
          target:currentNode.getAttribute('target'),
          isUnderLine:isUnderLine
        }
      }
      else if(currentNode?.tagName==='DIV'||currentNode?.tagName==='TD'){
        // 结束
        return {isLink:false,href:'',target:'',isUnderLine:false}
      }
      else if(currentNode?.parentNode){
        // 向上查找
        return this.findLinkUnderlineAction(currentNode.parentNode)
      }

    }
    catch (e){
      console.error(e)
      return {isLink:false,href:'',target:'',isUnderLine:false}
    }
  }

  propPageAction(){
    const selection: any = this.selection()
    const config:any={
      htmlVal:'',
      displayText: '',
      color:'',
      backgroundColor:'',
      fontFamily:'',
      fontSize:'',
      isBold:false,
      isSub: false,
      isPub: false,
      isItalic:false,
      isLineThrough:false,
      isLink:false,
      linkConfig:{
        href:'',
        target:''
      },
      isUnderLine:false,
      spanStyleConfig:{},
      tagName:'',
      parentNodeConfig:{
        // style 内容
        tagName:'',
        // font 颜色
        fontColor:'',
        // 颜色
        color:'',
        // 背景颜色
        backgroundColor:'',
        fontWeight:'',
        // 样式  italic
        fontStyle:'',
        // 下划线 underline
        textDecoration:'',
        // text-decoration-line  line-through 删除线
        textDecorationLine:'',
        // 字体
        fontFamily:'',
        // 字体大小
        fontSize:'',
      },
      currentNodeConfig:{
        // style 内容
        tagName:'',
        // font 颜色
        fontColor:'',
        // 颜色
        color:'',
        // 背景颜色
        backgroundColor:'',
        fontWeight:'',
        // 样式  italic
        fontStyle:'',
        // 下划线 underline
        textDecoration:'',
        // text-decoration-line  line-through 删除线
        textDecorationLine:'',
        // 字体
        fontFamily:'',
        // 字体大小
        fontSize:'',
        // font 标签特殊处理
        fontTagColor:'',
        fontTagFace:'',
        fontTagSize:'',
      },
      parentComputedStyle:{

      },
      startNodeComputedStyle:{

      },
      selectNode:null,
      orderListStatus:{
        isOrder: false,
        orderType: '',
      }
    };
    if (selection) {
      try{
        // 获取选区中的第一个范围
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;

        try{
          // 获取选区开始位置的节点
          let startNode:any = range.startContainer;
          if (startNode.nodeType === Node.TEXT_NODE && startNode.parentNode) {
            startNode = startNode.parentNode;  // 如果是文本节点，则获取其父节点
          }
          config.startNodeComputedStyle=window.getComputedStyle(startNode)
        }
        catch (e) {
          console.error('getComputedStyle error',e)
        }
        if(container.parentNode){
          // 父级节点获取
          config.parentNodeConfig.tagName=container.parentNode.tagName;
          try{
            const computedStyle=window.getComputedStyle(container.parentNode)
            // 取部分样式数据出来
            config.parentComputedStyle={
              // 颜色
              color:computedStyle.color,
              // 背景颜色
              backgroundColor:computedStyle.backgroundColor,
              // weight 权重
              fontWeight:computedStyle.fontWeight,
              // 样式 斜体
              fontStyle:computedStyle.fontStyle,
              // 字体
              fontFamily:computedStyle.fontFamily,
              // 大小
              fontSize:computedStyle.fontSize,
              // 行高
              lineHeight:computedStyle.lineHeight,
            }
          }
          catch (e) {
            console.error('getComputedStyle error',e)
          }
          if(config.parentNodeConfig.tagName==='FONT'){
            config.parentNodeConfig.fontFamily=container.parentNode.getAttribute('face');
            config.parentNodeConfig.fontSize=container.parentNode.getAttribute('size');
            config.parentNodeConfig.color=container.parentNode.getAttribute('color');
          }
          else if(config.parentNodeConfig.tagName==='SPAN'||config.parentNodeConfig.tagName==='DIV'||config.parentNodeConfig.tagName==='P'){
            const styleStr = container.parentNode?.getAttribute('style');
            const styleStrArr = styleStr ? styleStr.split(';') : [];
            const styleConfig:any = {};
            styleStrArr.forEach((styleItem:any) => {
              const styleStrVal = styleItem.trim();
              if (styleStrVal) {
                const styleItemArr = styleStrVal.split(':');
                if (styleItemArr.length > 1) {
                  const styleKey = styleItemArr[0].trim();
                  const styleVal = styleItemArr[1].trim();
                  styleConfig[styleKey]=styleVal
                }
              }
            });
            config.parentNodeConfig.color=styleConfig['color'];
            config.parentNodeConfig.backgroundColor=styleConfig['background-color'];
            config.parentNodeConfig.fontWeight=styleConfig['font-weight'];
            config.parentNodeConfig.fontStyle=styleConfig['font-style'];
            config.parentNodeConfig.textDecoration=styleConfig['text-decoration'];
            config.parentNodeConfig.textDecorationLine=styleConfig['text-decoration-line'];
            config.parentNodeConfig.fontFamily=styleConfig['font-family'];
            config.parentNodeConfig.fontSize=styleConfig['font-size'];
          }

        }


        if (selection.rangeCount) {


          // 查找选区中的链接节点
          let selectNode:any = {};
          if (container.nodeType === 3) {
            // 如果是文本节点
            selectNode = container.parentNode; // 获取父节点

          } else if (container.nodeType === 1) {
            // 如果是元素节点
            selectNode = container;
          }

          config.color=this.findFontColorAction(selectNode)?.color
          config.backgroundColor=this.findFontBackColorAction(selectNode)?.backgroundColor
          config.fontFamily=this.findFontFamilyAction(selectNode)?.fontFamily
          config.fontSize=this.findFontSizeAction(selectNode)?.fontsize

          if(config?.parentComputedStyle['font-weight']>500|| this.findBoldAction(selectNode).isBold){
            config.isBold=true
          }
          if(config?.parentComputedStyle['font-style']==='italic'|| this.findItalicAction(selectNode).isItalic){
            config.isItalic=true
          }
          if(config?.parentComputedStyle['text-decoration']==='underline'|| this.findUnderlineAction(selectNode).isUnderLine || this.findLinkUnderlineAction(selectNode).isUnderLine){
            config.isUnderLine=true
          }
          if(config?.parentComputedStyle['text-decoration']==='line-through' || this.findStrikeAction(selectNode).isLineThrough){
            // strike
            config.isLineThrough=true
          }
          // 下标
          if( this.findSubAction(selectNode).isSub){
            config.isSub=true
          }
          // 上标
          if( this.findSupAction(selectNode).isSup){
            config.isSup=true
          }


          const {isLink,href,target}=this.findLinkAction(selectNode)

          // 链接参数
          if(isLink){
            config.isLink=true
            config.linkConfig.href=href
            config.linkConfig.target=target
          }

          if(selectNode?.tagName==='SPAN'||config.parentNodeConfig.tagName==='DIV'||config.parentNodeConfig.tagName==='P'){
            const styleStr = selectNode?.getAttribute('style');
            const styleStrArr = styleStr ? styleStr.split(';') : [];
            const styleConfig:any = {};
            styleStrArr.forEach((styleItem:any) => {
              const styleStrVal = styleItem.trim();
              if (styleStrVal) {
                const styleItemArr = styleStrVal.split(':');
                if (styleItemArr.length > 1) {
                  const styleKey = styleItemArr[0].trim();
                  const styleVal = styleItemArr[1].trim();
                  if (styleKey === 'background-color') {
                    config.backgroundColor=styleVal
                  }
                  styleConfig[styleKey]=styleVal
                }
              }
            });
            // style config
            config.spanStyleConfig=styleConfig
          }

          config.tagName=selectNode.tagName


          // 获取选区中的文本内容
          config.displayText = selection.toString();
          try{
            let htmlVal = '';
            let container = this.doc.createElement('div');
            for (let i = 0, len = selection.rangeCount; i < len; ++i) {
              container.appendChild(selection.getRangeAt(i).cloneContents());
            }
            htmlVal = container.innerHTML;
            config.htmlVal = htmlVal;

            // 选中html内容  判断是 a 链接
            const parser = new DOMParser();
            const vDoc = parser.parseFromString(htmlVal, 'text/html');
            if(!config.isLink&&vDoc.body?.firstElementChild?.tagName?.toUpperCase()==='A'){
              config.isLink=true
              config.linkConfig.href=vDoc.body?.firstElementChild?.getAttribute?.('href')
              config.linkConfig.target=vDoc.body?.firstElementChild?.getAttribute?.('target')
            }
            else if(vDoc.body.querySelector('a')?.innerText?.trim()===config.displayText?.trim()){
              config.isLink=true
              config.linkConfig.href=vDoc.body.querySelector('a')?.getAttribute?.('href')
              config.linkConfig.target=vDoc.body.querySelector('a')?.getAttribute?.('target')
            }
            // 判断下划线
            if(!config.isUnderLine&&this.findLinkUnderlineAction(vDoc.body.firstElementChild)?.isUnderLine){
              config.isUnderLine=true
            }

            if(!config.color&&vDoc.body?.firstElementChild?.tagName?.toUpperCase()==='A'){
              config.color=this.getStyleAttrFromNode(vDoc.body.firstElementChild,'color').value
            }

          }
          catch (e){
            console.error(e)
          }

          config.orderListStatus=this.getSelectionIsOrderStatus()
          console.log('config',config)
        }
      }
      catch (e){
        console.error(e)
      }
    }


    // @ts-ignore changeSelection
    this?.em?._config?.richProps?.changeSelection?.(config)
  }

  updateActiveActions() {
    const actions = this.getActions();
    actions.forEach((action) => {
      const { update, btn } = action;
      const { active, inactive, disabled } = this.classes;
      const state = action.state;
      const name = action.name;
      const doc = this.doc;
      let currentState = RichTextEditorActionState.INACTIVE;

      if (btn) {
        btn.className = btn.className.replace(active, '').trim();
        btn.className = btn.className.replace(inactive, '').trim();
        btn.className = btn.className.replace(disabled, '').trim();
      }

      // if there is a state function, which depicts the state,
      // i.e. `active`, `disabled`, then call it
      if (state) {
        const newState = state(this, doc);
        currentState = newState;
        if (btn) {
          switch (newState) {
            case btnState.ACTIVE:
              btn.className += ` ${active}`;
              break;
            case btnState.INACTIVE:
              btn.className += ` ${inactive}`;
              break;
            case btnState.DISABLED:
              btn.className += ` ${disabled}`;
              break;
          }
        }
      } else {
        // otherwise default to checking if the name command is supported & enabled
        if (doc.queryCommandSupported(name) && doc.queryCommandState(name)) {
          btn && (btn.className += ` ${active}`);
          currentState = RichTextEditorActionState.ACTIVE;
        }
      }
      action.currentState = currentState;
      update?.(this, action);
    });
    // // 影响属性编辑 图片上传无效
    setTimeout(()=>{
      this.propPageAction()
    },10)
    actions.length && this.em.RichTextEditor.__dbdTrgCustom();
  }

  enable(opts: EffectOptions) {
    // enableToolbarAction 自定义的编辑状态
    // @ts-ignore 开关
    // this?.em?._config?.richProps?.enableToolbarAction?.(this.em.RichTextEditor)
    if (this.enabled) return this;
    return this.__toggleEffects(true, opts);
  }
  // 查找最近的列表项
  findClosestListItem (node:Node){
    if(!node){
      return null
    }
    // @ts-ignore
    if(node.tagName=='OL'||node.tagName=='UL'){
      return node
    }
    // @ts-ignore
    else if(node?.querySelector?.('ol')){
      // @ts-ignore
      return node.querySelector('ol')
    }
    // @ts-ignore
    else if(node.querySelector?.('li')){
      // @ts-ignore
      return node.querySelector('li')
    }
    // 排除div
    // @ts-ignore
    while (node&&node.tagName!=='DIV') {
      // @ts-ignore
      if (node.tagName === 'LI') {
        return node;
      }
      // @ts-ignore 向上查找
      node = node.parentNode;
    }
    return null;
  }
// 优化后的方法：取消有序列表中的特定行
  newRemoveOrderedList(list: HTMLElement) {
    const selection = this.doc.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const selectedItems = this.getSelectedListItems(range, list);

    console.log('Selected items count:',selectedItems, selectedItems.length); // 调试日志

    if (selectedItems.length === 0) {
      // 如果没有选中具体的列表项，检查光标是否在列表项内
      const cursorInItem = this.getCursorListItem(range, list);
      if (cursorInItem) {
        // 光标在某个列表项内，只取消该项
        this.removeSingleListItem(cursorInItem, list);
      } else {
        // 执行原来的全部取消逻辑
        this.removeEntireOrderedList(list);
      }
      return;
    }

    if (selectedItems.length === list.children.length) {
      // 选中了所有列表项，取消整个列表
      this.removeEntireOrderedList(list);
    } else {
      // 选中部分列表项
      this.removePartialListItems(selectedItems, list);
    }
  }

// 辅助方法：获取光标所在的列表项
  private getCursorListItem(range: Range, list: HTMLElement): HTMLLIElement | null {
    let node: Node | null = range.startContainer;

    // 向上查找直到找到 LI 元素或到达列表边界
    while (node && node !== list) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'LI') {
        const li = node as HTMLLIElement;
        // 确保这个 LI 在当前的 list 内
        if (list.contains(li)) {
          return li;
        }
      }
      node = node.parentNode;
    }

    return null;
  }



// 辅助方法：获取所有选中的列表项（改进版）
  private getSelectedListItems(range: Range, list: HTMLElement): HTMLLIElement[] {
    const listItems = Array.from(list.children) as HTMLLIElement[];
    const selectedItems: HTMLLIElement[] = [];

    listItems.forEach(li => {
      // 使用更精确的选区检测
      const liRange = document.createRange();
      liRange.selectNodeContents(li);

      // 检查两个范围是否有交集
      if (range.intersectsNode(li) ||
          range.compareBoundaryPoints(Range.START_TO_START, liRange) >= 0 &&
          range.compareBoundaryPoints(Range.START_TO_END, liRange) <= 0) {
        selectedItems.push(li);
      }
    });

    return selectedItems;
  }

// 辅助方法：移除部分列表项并保持列表结构（修复版）
  private removePartialListItems(selectedItems: HTMLLIElement[], list: HTMLElement) {
    const parent = list.parentNode;
    if (!parent) return;

    // 如果只选中一项，使用单项目移除逻辑
    if (selectedItems.length === 1) {
      this.removeSingleListItem(selectedItems[0], list);
      return;
    }

    const allListItems = Array.from(list.children) as HTMLLIElement[];
    const firstSelectedIndex = allListItems.indexOf(selectedItems[0]);
    const lastSelectedIndex = allListItems.indexOf(selectedItems[selectedItems.length - 1]);

    // 创建文档片段来存放转换后的内容
    const fragment = document.createDocumentFragment();
    fragment.appendChild(document.createElement('br'));

    // 处理选中的列表项
    selectedItems.forEach((li, index) => {
      const span = document.createElement('span');

      // 复制内容
      while (li.firstChild) {
        span.appendChild(li.firstChild);
      }

      fragment.appendChild(span);

      // 只在非最后一项时添加换行
      if (index < selectedItems.length - 1) {
        fragment.appendChild(document.createElement('br'));
      }
    });

    // 分割列表
    const itemsBeforeSelection = allListItems.slice(0, firstSelectedIndex);
    const itemsAfterSelection = allListItems.slice(lastSelectedIndex + 1);

    const listTag = list.tagName.toLowerCase();

    // 关键修复：保存原始列表的位置
    const originalNextSibling = list.nextSibling;

    // 移除原始列表
    parent.removeChild(list);

    // 如果选择前面有项目，创建第一个列表
    if (itemsBeforeSelection.length > 0) {
      const firstList = document.createElement(listTag);
      firstList.setAttribute('type', list.getAttribute('type') || '1');
      itemsBeforeSelection.forEach(li => firstList.appendChild(li));

      // 插入到原始列表的位置
      if (originalNextSibling) {
        parent.insertBefore(firstList, originalNextSibling);
      } else {
        parent.appendChild(firstList);
      }
    }

    // 插入转换后的内容（被取消序号的项）
    if (originalNextSibling) {
      parent.insertBefore(fragment, originalNextSibling);
    } else {
      parent.appendChild(fragment);
    }

    // 如果选择后面有项目，创建第二个列表
    if (itemsAfterSelection.length > 0) {
      const secondList = document.createElement(listTag);
      secondList.setAttribute('type', list.getAttribute('type') || '1');
      itemsAfterSelection.forEach(li => secondList.appendChild(li));

      // 插入到片段后面
      if (originalNextSibling) {
        parent.insertBefore(secondList, originalNextSibling);
      } else {
        parent.appendChild(secondList);
      }
    }
  }

// 辅助方法：分割列表并移除指定项（修复版）
  private splitListAndRemoveItem(list: HTMLElement, itemToRemove: HTMLLIElement, parent: Node) {
    const allItems = Array.from(list.children) as HTMLLIElement[];
    const itemIndex = allItems.indexOf(itemToRemove);

    const itemsBefore = allItems.slice(0, itemIndex);
    const itemsAfter = allItems.slice(itemIndex + 1);

    const listTag = list.tagName.toLowerCase();

    // 创建 span 替换要移除的项
    const span = document.createElement('span');
    while (itemToRemove.firstChild) {
      span.appendChild(itemToRemove.firstChild);
    }
    const br = document.createElement('br');

    // 关键修复：保存原始位置
    const originalNextSibling = list.nextSibling;

    // 移除原始列表
    parent.removeChild(list);

    // 插入前半部分列表（如果有）
    if (itemsBefore.length > 0) {
      const firstList = document.createElement(listTag);
      firstList.setAttribute('type', list.getAttribute('type') || '1');
      itemsBefore.forEach(item => firstList.appendChild(item));

      if (originalNextSibling) {
        parent.insertBefore(firstList, originalNextSibling);
      } else {
        parent.appendChild(firstList);
      }
    }

    // 插入被取消的项
    if (originalNextSibling) {
      parent.insertBefore(span, originalNextSibling);
      parent.insertBefore(br, originalNextSibling);
    } else {
      parent.appendChild(span);
      parent.appendChild(br);
    }

    // 插入后半部分列表（如果有）
    if (itemsAfter.length > 0) {
      const secondList = document.createElement(listTag);
      secondList.setAttribute('type', list.getAttribute('type') || '1');
      itemsAfter.forEach(item => secondList.appendChild(item));

      if (originalNextSibling) {
        parent.insertBefore(secondList, originalNextSibling);
      } else {
        parent.appendChild(secondList);
      }
    }
  }

// 辅助方法：移除单个列表项（修复版）
  private removeSingleListItem(li: HTMLLIElement, list: HTMLElement) {
    const parent = list.parentNode;
    if (!parent) return;
    console.log('removeSingleListItem li before',li)
    const allListItems = Array.from(list.children) as HTMLLIElement[];
    const itemIndex = allListItems.indexOf(li);

    if (itemIndex === -1) return;

    console.log('removeSingleListItem li',li)
    console.log('removeSingleListItem li.firstChild',li.firstChild)
    // 创建 span 替换 li
    const span = document.createElement('span');
    span.innerHTML=simplifySpansWithStyleMerge(li.innerHTML)
    // while (li.firstChild) {
    //   span.appendChild(li.firstChild);
    // }

    // 保存原始位置
    const originalNextSibling = list.nextSibling;

    // 在适当位置插入 span
    if (itemIndex === 0 && allListItems.length === 1) {
      // 如果是唯一项，直接替换整个列表
      parent.replaceChild(span, list);
      // 添加换行
      const br = document.createElement('br');
      if (originalNextSibling) {
        parent.insertBefore(br, originalNextSibling);
      } else {
        parent.appendChild(br);
      }
    } else if (itemIndex === 0) {
      // 如果是第一项
      const br = document.createElement('br');
      // 先移除该项
      list.removeChild(li);
      // 在列表前插入
      if (originalNextSibling) {
        parent.insertBefore(br, list);
        parent.insertBefore(span, list);
      } else {
        parent.insertBefore(span, list);
        parent.insertBefore(br, list);
      }
    } else if (itemIndex === allListItems.length - 1) {
      // 如果是最后一项
      const br = document.createElement('br');
      // 先移除该项
      list.removeChild(li);
      // 在列表后插入
      if (originalNextSibling) {
        parent.insertBefore(span, originalNextSibling);
        parent.insertBefore(br, originalNextSibling);
      } else {
        parent.appendChild(span);
        parent.appendChild(br);
      }
    } else {
      // 如果是中间项，分割列表
      this.splitListAndRemoveItem(list, li, parent);
    }
  }

// 原来的全部取消逻辑（保持不变）
  private removeEntireOrderedList(list: HTMLElement) {
    const parent = list.parentNode;
    const listItems = Array.from(list.children);

    const fragment = document.createDocumentFragment();

    listItems.forEach((li, index) => {
      const span = document.createElement('span');

      while (li.firstChild) {
        span.appendChild(li.firstChild);
      }

      fragment.appendChild(span);

      // 只在非最后一项时添加换行
      if (index < listItems.length - 1) {
        const br = document.createElement('br');
        fragment.appendChild(br);
      }
    });

    parent?.replaceChild(fragment, list);
  }

  // 新增方法：取消有序列表
  removeOrderedList(list:HTMLElement) {
    const parent = list.parentNode;
    const listItems = Array.from(list.children);

    // 创建文档片段来存放转换后的内容
    const fragment = document.createDocumentFragment();

    listItems.forEach((li, index) => {
      // 为每个列表项创建span来替代
      const span = document.createElement('span');

      // 复制li的所有内容
      while (li.firstChild) {
        span.appendChild(li.firstChild);
      }

      // 如果不是最后一个项目，添加换行
      if (index < listItems.length - 1) {
        const br = document.createElement('br');
        fragment.appendChild(span);
        fragment.appendChild(br);
      } else {
        fragment.appendChild(span);
      }
    });

    // 用转换后的内容替换列表
    parent?.replaceChild(fragment, list);
    this.updateActiveActions()
  }
  // @ts-ignore 将无序列表转换为有序列表
  convertUlToOl(element:any, type) {
    const newList = document.createElement('ol');
    newList.setAttribute('type', type);

    if (element.tagName === 'UL') {
      // 转换整个无序列表
      Array.from(element.childNodes).forEach((child:any) => {
        newList.appendChild(child.cloneNode(true));
      });
      element?.parentNode.replaceChild(newList, element);
    } else if (element.tagName === 'LI' && element.parentNode.tagName === 'UL') {
      // 转换单个列表项所在的整个无序列表
      const ul = element.parentNode;
      Array.from(ul.childNodes).forEach((child:any) => {
        newList.appendChild(child.cloneNode(true));
      });
      ul.parentNode.replaceChild(newList, ul);
    }
  }

  // 处理单个列表项
  // @ts-ignore
  processSingleListItem(listItem:any, type) {
    const list = listItem.parentNode;
    console.log('list parentNode', list);

    if (listItem.tagName === 'OL' && listItem.getAttribute('type') !== type) {
      listItem.setAttribute('type', type);
      console.log('修改序号 listItem', listItem);
    } else if (listItem.tagName === 'OL' && listItem.getAttribute('type') === type) {
      this.removeOrderedList(listItem);
      return;
    } else if (list.tagName === 'OL' && list.getAttribute('type') !== type) {
      list.setAttribute('type', type);
      console.log('修改序号 list', list);
    } else if (list.tagName === 'OL' && list.getAttribute('type') === type) {
      this.removeOrderedList(list);
      return;
    } else if (listItem.tagName === 'UL') {
      this.convertUlToOl(listItem, type);
    } else if (list.tagName === 'UL') {
      this.convertUlToOl(list, type);
    }
  }

  getSelectionIsOrderStatus(){
    const { em, doc, el } = this;
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return {
        isOrder: false,
        orderType: ''
      }
    };
    const cmdList = ['insertOrderedList', 'insertUnorderedList'];

    if (cmdList.some(cmd => doc.queryCommandState(cmd))) {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      // 检查是否在单个列表项中（处理未选中的情况）
      const listItem = this.findClosestListItem(container);
      // 如果已经在列表中，则切换列表类型
      const list = listItem.parentNode;
      console.log('listItem createOrderedList',listItem)
      let orderType='1'
      let type='ol'
      if(listItem.tagName === 'OL'){
        orderType=listItem.getAttribute('type')||orderType
      }
      else if(list.tagName === 'OL'){
        orderType=list.getAttribute('type')||orderType
      }
      else if(listItem.tagName === 'UL'){
        type='ul'
        orderType=listItem.getAttribute('type')||orderType
      }
      else if(list.tagName === 'UL'){
        type='ul'
        orderType=list.getAttribute('type')||orderType
      }
      return {
        isOrder: true,
        orderType: orderType,
        type:type
      }
    }
    return {
      isOrder: false,
      orderType: ''
    }
  }

  // 创建选区 参考https://developer.mozilla.org/zh-CN/docs/Web/HTML/Reference/Elements/ol
  createOrderedList(type:'a'|'A'|'i'|'I'|'1'){
    const { em, doc, el } = this;
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    console.log('range,startContainer',range.startContainer)
    const container = range.commonAncestorContainer;
    // 检查是否在单个列表项中（处理未选中的情况）
    const listItem = this.findClosestListItem(container);
    console.log('listItem createOrderedList',listItem)
    // 检查是否在列表项中
    if (listItem) {
      // 如果已经在列表中，则切换列表类型
      const list = listItem.parentNode;
      console.log('list parentNode',list)
      const startNode = range.startContainer;
      const endNode = range.endContainer;
      console.log('list parentNode startNode',startNode)
      console.log('list parentNode startNode parentNode',startNode.parentNode)
      console.log('list parentNode container',container)
      console.log('list parentNode endNode',endNode)

      // @ts-ignore
      if (listItem.tagName === 'OL'&& listItem.getAttribute('type')!==type) {
        // 如果已经是有序列表，直接修改type属性
        // @ts-ignore
        listItem.setAttribute('type', type);
        console.log('修改序号 listItem',listItem)
      }
      // @ts-ignore
      else if (listItem.tagName === 'OL'&& listItem.getAttribute('type')===type) {
        // 如果已经是有序列表,清空有序列表
        this.newRemoveOrderedList(listItem)
        // this.removeOrderedList(listItem)
        return
      }
      // @ts-ignore
      else if (list.tagName === 'OL'&& list.getAttribute('type')!==type) {
        // 如果已经是有序列表，直接修改type属性
        // @ts-ignore
        list.setAttribute('type', type);
        console.log('修改序号 list',list)
      }
      // @ts-ignore
      else if (list.tagName === 'OL'&& list.getAttribute('type')===type) {
        // 如果已经是有序列表,清空有序列表
        this.newRemoveOrderedList(list)
        // this.removeOrderedList(list)
        return
      }
      // @ts-ignore
      else if (listItem.tagName === 'UL') {
        // 将无序列表转换为有序列表
        const newList = document.createElement('ol');
        newList.setAttribute('type',type)
        // @ts-ignore
        Array.from(listItem.childNodes).forEach(child => {
          // @ts-ignore
          newList.appendChild(child.cloneNode(true));
        });
        // @ts-ignore
        listItem.parentNode.replaceChild(newList, listItem);
      }
      // @ts-ignore
      else if (list.tagName === 'UL') {
        // 将无序列表转换为有序列表
        const newList = document.createElement('ol');
        newList.setAttribute('type',type)
        // @ts-ignore
        Array.from(list.childNodes).forEach(child => {
          // @ts-ignore
          newList.appendChild(child.cloneNode(true));
        });
        // @ts-ignore
        list.parentNode.replaceChild(newList, list);
      }
      return;
    }
    console.log('创建有序列表 listItem',listItem)
    // 创建新的有序列表
    const newList = document.createElement('ol');
    newList.setAttribute('type',type)
    // 处理选区内容
    if (range.collapsed) {
      console.log('空内容')
      const listItemElement = document.createElement('li');
      // 如果选区是空的，添加示例文本
      listItemElement.textContent = '';
      newList.appendChild(listItemElement);
    } else {
      // 关键修改：提取选区内容并处理换行
      const fragment = range.extractContents(); // 这会从文档中移除选区内容并返回一个DocumentFragment[1,2](@ref)

      // 将DocumentFragment的内容转换为字符串进行处理[6,7](@ref)
      const tempDiv = document.createElement('div');

      const insertNode=fragment.cloneNode(true)
      // @ts-ignore
      if(insertNode?.querySelector?.('td')||insertNode?.querySelector?.('div')){
        // @ts-ignore
        tempDiv.appendChild(insertNode.querySelector('div').firstChild); // 克隆片段以避免直接操作原始片段
      }
      else{
        tempDiv.appendChild(insertNode); // 克隆片段以避免直接操作原始片段
      }


      // br 换行处理
      tempDiv.querySelectorAll('br').forEach(brDom=>{
        // 获取所有属性
        const attributes = brDom.attributes;
        // 创建一个数组来存储属性名，因为在迭代过程中直接修改attributes可能会有问题
        const attrNames = [];
        for (let i = 0; i < attributes.length; i++) {
          attrNames.push(attributes[i].name);
        }
        // 遍历属性名数组，并删除每个属性
        for (let i = 0; i < attrNames.length; i++) {
          brDom.removeAttribute(attrNames[i]);
        }
      })
      const contentWithLineBreaks = tempDiv.innerHTML;

      console.log(contentWithLineBreaks,'contentWithLineBreaks')

      // 使用正则表达式分割字符串，考虑不同形式的换行符[6,7](@ref)
      // 匹配 <br>、<br/>、<br /> 标签以及文字换行符 \n
      const lines = contentWithLineBreaks.split(/(?:<br\s*\/?>|\n)/i);

      // 为每个非空行创建列表项
      lines.forEach(line => {
        // 修剪空格并检查是否非空
        if (line.trim() !== '') {
          const listItemElement = document.createElement('li');
          // 将HTML字符串设置回列表项
          listItemElement.innerHTML = line;
          newList.appendChild(listItemElement);
        }
      });

      // 如果所有行都为空，确保至少有一个列表项
      if (newList.children.length === 0) {
        const listItemElement = document.createElement('li');
        newList.appendChild(listItemElement);
      }
    }
    // 清除原有选区内容（虽然extractContents已移除，但确保清理范围） 插入新列表
    range.deleteContents();
    range.insertNode(newList);
  }

  // 创建选区 参考https://developer.mozilla.org/zh-CN/docs/Web/HTML/Reference/Elements/ol
  createDisOrderedList(type:'disc'|'circle'|'square'){
    const { em, doc, el } = this;
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    // 检查是否在列表项中
    const listItem = this.findClosestListItem(container);
    if (listItem) {
      // 如果已经在列表中，则切换列表类型
      const list = listItem.parentNode;
      const startNode = range.startContainer;
      const endNode = range.endContainer;
      console.log('startNode',startNode)
      console.log('endNode',endNode)
      // @ts-ignore
      if (listItem.tagName === 'UL'&& listItem.getAttribute('type')!==type) {
        // 如果已经是有序列表，直接修改type属性
        // @ts-ignore
        listItem.setAttribute('type', type);
        console.log('修改无序号 listItem',listItem)
      }
      // @ts-ignore
      else if (listItem.tagName === 'UL'&& listItem.getAttribute('type')===type) {
        // 如果已经是无序列表,清空有序列表
        this.newRemoveOrderedList(listItem)
        return
      }
      // @ts-ignore
      else if (list.tagName === 'UL'&& list.getAttribute('type')!==type) {
        // 如果已经是有序列表，直接修改type属性
        // @ts-ignore
        list.setAttribute('type', type);
        console.log('修改无序号 list',list)
      }
      // @ts-ignore
      else if (list.tagName === 'UL'&& list.getAttribute('type')===type) {
        // 如果已经是无序列表,清空有序列表
        this.newRemoveOrderedList(list)
        return
      }
      // @ts-ignore
      else if (listItem.tagName === 'OL') {
        // 将有序列表转换为无序列表
        const newList = document.createElement('ul');
        newList.setAttribute('type',type)
        // @ts-ignore
        Array.from(listItem.childNodes).forEach(child => {
          // @ts-ignore
          newList.appendChild(child.cloneNode(true));
        });
        // @ts-ignore
        listItem.parentNode.replaceChild(newList, listItem);
      }
      // @ts-ignore
      else if (list.tagName === 'OL') {
        // 将有序列表转换为无序列表
        const newList = document.createElement('ul');
        newList.setAttribute('type',type)
        // @ts-ignore
        Array.from(list.childNodes).forEach(child => {
          // @ts-ignore
          newList.appendChild(child.cloneNode(true));
        });
        // @ts-ignore
        list.parentNode.replaceChild(newList, list);
      }
      return;
    }
    // 创建新的有序列表
    const newList = document.createElement('ul');
    newList.setAttribute('type',type)
    // 处理选区内容
    if (range.collapsed) {
      const listItemElement = document.createElement('li');
      // 如果选区是空的，添加示例文本
      listItemElement.textContent = '';
      newList.appendChild(listItemElement);
    } else {
      // 关键修改：提取选区内容并处理换行
      const fragment = range.extractContents(); // 这会从文档中移除选区内容并返回一个DocumentFragment[1,2](@ref)

      // 将DocumentFragment的内容转换为字符串进行处理[6,7](@ref)
      const tempDiv = document.createElement('div');

      const insertNode=fragment.cloneNode(true)
      // @ts-ignore
      if(insertNode?.querySelector?.('td')||insertNode?.querySelector?.('div')){
        // @ts-ignore
        tempDiv.appendChild(insertNode.querySelector('div').firstChild); // 克隆片段以避免直接操作原始片段
      }
      else{
        tempDiv.appendChild(insertNode); // 克隆片段以避免直接操作原始片段
      }

      // br 换行处理
      tempDiv.querySelectorAll('br').forEach(brDom=>{
        // 获取所有属性
        const attributes = brDom.attributes;
        // 创建一个数组来存储属性名，因为在迭代过程中直接修改attributes可能会有问题
        const attrNames = [];
        for (let i = 0; i < attributes.length; i++) {
          attrNames.push(attributes[i].name);
        }
        // 遍历属性名数组，并删除每个属性
        for (let i = 0; i < attrNames.length; i++) {
          brDom.removeAttribute(attrNames[i]);
        }
      })
      const contentWithLineBreaks = tempDiv.innerHTML;

      console.log(contentWithLineBreaks,'contentWithLineBreaks')

      // 使用正则表达式分割字符串，考虑不同形式的换行符[6,7](@ref)
      // 匹配 <br>、<br/>、<br /> 标签以及文字换行符 \n
      const lines = contentWithLineBreaks.split(/(?:<br\s*\/?>|\n)/i);

      // 为每个非空行创建列表项
      lines.forEach(line => {
        // 修剪空格并检查是否非空
        if (line.trim() !== '') {
          const listItemElement = document.createElement('li');
          // 将HTML字符串设置回列表项
          listItemElement.innerHTML = line;
          newList.appendChild(listItemElement);
        }
      });

      // 如果所有行都为空，确保至少有一个列表项
      if (newList.children.length === 0) {
        const listItemElement = document.createElement('li');
        newList.appendChild(listItemElement);
      }
    }

    // 插入新列表
    range.deleteContents();
    range.insertNode(newList);
  }

  disable() {
    // hideToolbarAction 自定义的编辑状态
    // @ts-ignore
    this?.em?._config?.richProps?.hideToolbarAction?.()
    return this.__toggleEffects(false);
  }

  checkForVariablePrompt(){
    const selection = this.doc.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const cursorPosition = range.startOffset;
    const currentNode = range.startContainer;

    // @ts-ignore获取光标前后的文本
    const textBeforeCursor = currentNode.textContent.substring(0, cursorPosition);
    // @ts-ignore获取光标前后的文本
    const textAfterCursor = currentNode.textContent.substring(cursorPosition);
    console.log(container,'checkForVariablePrompt container')
    console.log(selection.toString(),'__onInput textBeforeCursor')
    console.log(cursorPosition,'checkForVariablePrompt cursorPosition')
    console.log(textBeforeCursor,'checkForVariablePrompt textBeforeCursor')
    console.log(textAfterCursor,'checkForVariablePrompt textAfterCursor')
    // 检查是否满足 {{ 条件
    if (textBeforeCursor.endsWith('{{') && textAfterCursor.startsWith('}}')) {
      console.log('checkForVariablePrompt 这是变量')
    }
  }

  __onSelectionChange(event:Event){
    // 延迟检查，确保选择已完成
    setTimeout(() => {
      this.checkForVariablePrompt();
    }, 10);

    // console.log('__onSelectionChange change event',event.target)
    // if(!event.target) return
    // // @ts-ignore
    // const selection = event.target.ownerDocument.getSelection();
    // if (!selection || selection.rangeCount === 0) return;
    //
    // const range = selection.getRangeAt(0);
    // const container = range.commonAncestorContainer;
    // const cursorPosition = range.startOffset;
    // const currentNode = range.startContainer;
    //
    // // @ts-ignore获取光标前后的文本
    // const textBeforeCursor = currentNode.textContent.substring(0, cursorPosition);
    // // @ts-ignore获取光标前后的文本
    // const textAfterCursor = currentNode.textContent.substring(cursorPosition);
    // console.log(container,'__onSelectionChange container')
    // console.log(selection.toString(),'__onSelectionChange textBeforeCursor')
    // console.log(cursorPosition,'__onSelectionChange cursorPosition')
    // console.log(textBeforeCursor,'__onSelectionChange textBeforeCursor')
    // console.log(textAfterCursor,'__onSelectionChange textAfterCursor')
  }

  __onInput(e:Event) {
    console.log('__onInput e',e)
    // @ts-ignore
    const selection = this?.doc?.getSelection?.();

    if (!selection || selection.rangeCount === 0) return;


    const range = selection.getRangeAt(0);
    // const container = range.commonAncestorContainer;
    const cursorPosition = range.startOffset;
    const startContainer = range.startContainer;
    const currentNode = range.startContainer;
    const anchorNode=selection.anchorNode
    console.log('__onInput move range cursorPosition',range,cursorPosition)
    console.log('__onInput currentNode',currentNode)
    console.log('__onInput anchorNode',anchorNode)
    // @ts-ignore获取光标前后的文本
    const textBeforeCursor = currentNode.textContent.substring(0, cursorPosition);
    // @ts-ignore获取光标前后的文本
    const textAfterCursor = currentNode.textContent.substring(cursorPosition);
    // // 渲染
    const rect = range.getBoundingClientRect();

    console.log('textBeforeCursor',textBeforeCursor)
    console.log('textAfterCursor',textAfterCursor)
    // 处理不同节点类型
    let textBefore = '', textAfter = '';

    if (startContainer.nodeType === Node.TEXT_NODE) {
      //@ts-ignore 文本节点
      textBefore = startContainer.textContent.substring(0, range.startOffset);
      //@ts-ignore 文本节点
      textAfter = startContainer.textContent.substring(range.startOffset);
    } else {
      //@ts-ignore 元素节点 - 获取整个上下文
      const walker = document.createTreeWalker(
          range.commonAncestorContainer,
          NodeFilter.SHOW_TEXT,
          null,
      );

      let currentTextNode;
      let beforeCursor = true;
      const texts = { before: '', after: '' };

      while (currentTextNode = walker.nextNode()) {
        if (currentTextNode === startContainer) {
          //@ts-ignore 文本节点
          texts.before += currentTextNode.textContent.substring(0, range.startOffset);
          //@ts-ignore 文本节点
          texts.after += currentTextNode.textContent.substring(range.startOffset);
          beforeCursor = false;
        } else if (beforeCursor) {
          texts.before += currentTextNode.textContent;
        } else {
          texts.after += currentTextNode.textContent;
        }
      }

      textBefore = texts.before;
      textAfter = texts.after;

    }
    console.log('__onInput calc textBefore textAfter','before',textBefore,'after',textAfter)

    // 检查是否满足 {{ 条件
    if (textBefore.includes('{{') && textAfter.includes('}}')) {
      console.log('in textBeforeCursor',textBefore)
      console.log('in textAfterCursor',textAfter)
      if(textBefore.lastIndexOf('{{')<textBefore.lastIndexOf('}}')){
        // @ts-ignore
        this?.em?._config?.richProps?.variableAction?.({
          startVarWord:'',
          endVarWord:'',
          searchVarName:'',
          left: `${rect.left + window.scrollX}px`,
          top: `${rect.bottom + window.scrollY}px`,
          isVar:false
        });
        return
      }

      const startPosWord = textBeforeCursor
          .substring(textBeforeCursor.lastIndexOf('{{'))
          .replace('{{', '');
      const endPosWord = textAfterCursor
          .substring(0, textAfterCursor.indexOf('}}'))
          .replace('}}', '');

      const searchVarName = startPosWord + endPosWord;
      console.log('options',{
        startVarWord:startPosWord,
        endVarWord:endPosWord,
        isVar:true
      })

      console.log('this',this)
      console.log('this',this.em)
      // @ts-ignore
      this?.em?._config?.richProps?.variableAction?.({
        startVarWord:startPosWord,
        endVarWord:endPosWord,
        searchVarName:searchVarName,
        left: `${rect.left + window.scrollX}px`,
        top: `${rect.bottom + window.scrollY }px`,
        isVar:true
      });
    }
    else{
      console.log('options',{
        startVarWord:'',
        endVarWord:'',
        searchVarName:'',
        isVar:false
      })
      // @ts-ignore
      this?.em?._config?.richProps?.variableAction?.({
        startVarWord:'',
        endVarWord:'',
        searchVarName:'',
        left: `${rect.left + window.scrollX}px`,
        top: `${rect.bottom + window.scrollY}px`,
        isVar:false
      });
    }

  }
  /**
   * 查找文本节点
   */
  private findTextNodeAtPosition(element: Node, position: number): Node | null {
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null
    );

    let currentNode: Node | null;
    let currentPosition = 0;

    while ((currentNode = walker.nextNode())) {
      const textLength = currentNode.textContent?.length || 0;
      if (position >= currentPosition && position <= currentPosition + textLength) {
        return currentNode;
      }
      currentPosition += textLength;
    }

    return null;
  }

  // 插入变量
  __insertVariable(varVal:string) {
    const {el,doc}=this
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const cursorPosition = range.startOffset;


    let textNode: Node;
    let textContent: string;

    if (container.nodeType === Node.ELEMENT_NODE) {
      textNode = this.findTextNodeAtPosition(container, cursorPosition) || container;
      textContent = textNode.textContent || '';
    } else {
      textNode = container;
      textContent = container.textContent || '';
    }

    const textBeforeCursor = textContent.substring(0, cursorPosition);
    const textAfterCursor = textContent.substring(cursorPosition);

    const lastOpenBrace = textBeforeCursor.lastIndexOf('{{');
    const nextCloseBrace = textAfterCursor.indexOf('}}');
    console.log('textContent',textContent)
    console.log('textBeforeCursor',textBeforeCursor)
    console.log('textAfterCursor',textAfterCursor)
    console.log('lastOpenBrace',lastOpenBrace)
    console.log('nextCloseBrace',nextCloseBrace)

    if (lastOpenBrace === -1 || nextCloseBrace === -1) {
      console.warn('未找到完整的 {{}} 模板');
      return;
    }

    const varStart = lastOpenBrace;
    const varEnd = cursorPosition + nextCloseBrace + 2;
    const variableSpan = document.createElement('span');
    variableSpan.className = 'var-light-system';
    variableSpan.contentEditable = 'false';
    variableSpan.textContent = `${varVal}`; // 或者根据需求显示其他内容

    // 替换内容
    const replaceRange = document.createRange();
    replaceRange.setStart(textNode, varStart);
    replaceRange.setEnd(textNode, varEnd);
    replaceRange.deleteContents();

    // 插入变量和零宽空格
    const spaceBefore = document.createTextNode('\u200B');
    const spaceAfter = document.createTextNode('\u200B');

    const fragment = document.createDocumentFragment();
    fragment.appendChild(spaceBefore);
    fragment.appendChild(variableSpan);
    fragment.appendChild(spaceAfter);

    replaceRange.insertNode(fragment);

    // 移动光标到变量后面
    const newRange = document.createRange();
    newRange.setStartAfter(variableSpan);
    newRange.collapse(true);

    selection.removeAllRanges();
    selection.addRange(newRange);

  }


  __toggleEffects(enable = false, opts: EffectOptions = {}) {
    const method = enable ? on : off;
    const { el, doc } = this;
    const actionbar = this.actionbarEl();
    actionbar && (actionbar.style.display = enable ? '' : 'none');
    el.contentEditable = `${!!enable}`;

    // @ts-ignore
    this?.em?._config?.richProps?.variableAction?.({
      startVarWord:'',
      endVarWord:'',
      searchVarName:'',
      left: `0`,
      top: `0`,
      isVar:false
    });
    // 去掉br 属性
    el.querySelectorAll('br').forEach((brDom: HTMLSpanElement) => {
      for (const name of brDom.getAttributeNames()) {
        brDom.removeAttribute(name);
      }
    });
    // @ts-ignore
    el.querySelectorAll('span.var-light-system').forEach((span: HTMLSpanElement) => {
      // @ts-ignore
      if(span.getAttribute('contenteditable') !== 'false'){
        span.setAttribute('contenteditable', 'false')
      }
      for (const name of ['id','draggable']) {
        span.removeAttribute(name);
      }
      // 检查前后是否有空白字符，如果没有则添加零宽空格
      const previousSibling = span.previousSibling;
      const nextSibling = span.nextSibling;
      // 检查前一个节点是否是文本节点且以空白字符结尾
      if (!previousSibling ||
          (previousSibling.nodeType === Node.TEXT_NODE &&
              !/\s$/.test(previousSibling.textContent || ''))) {
        const spaceBefore = document.createTextNode('\u200B');
        span.parentNode?.insertBefore(spaceBefore, span);
      }

      // 检查后一个节点是否是文本节点且以空白字符开头
      if (!nextSibling ||
          (nextSibling.nodeType === Node.TEXT_NODE &&
              !/^\s/.test(nextSibling.textContent || ''))) {
        const spaceAfter = document.createTextNode('\u200B');
        span.parentNode?.insertBefore(spaceAfter, span.nextSibling);
      }
    });
    method(el, 'mouseup keyup', this.updateActiveActions);
    // @ts-ignore 添加输入事件监听
    method(el, 'input',  (e)=>{
      this.__onInput(e)
    });
    method(el, 'keyup', (e)=>{
      this.__onInput(e)
    });
    method(el, 'blur', (e)=>{
      // @ts-ignore
      this?.em?._config?.richProps?.variableAction?.({
        startVarWord:'',
        endVarWord:'',
        searchVarName:'',
        left: `0`,
        top: `0`,
        isVar:false
      });
    });
    method(el, 'click', (e)=>{
      this.__onInput(e)
    });
    method(doc, 'keydown', this.__onKeydown);
    method(doc, 'paste', this.__onPaste);
    this.enabled = enable;

    if (enable) {
      const { event } = opts;
      this.syncActions();
      this.updateActiveActions();

      if (event) {
        let range = null;

        // Still used as caretPositionFromPoint is not yet well adopted
        if (doc.caretRangeFromPoint) {
          const poiner = getPointerEvent(event);
          range = doc.caretRangeFromPoint(poiner.clientX, poiner.clientY);
          // @ts-ignore
        } else if (event.rangeParent) {
          range = doc.createRange();
          // @ts-ignore
          range.setStart(event.rangeParent, event.rangeOffset);
        }

        const sel = doc.getSelection();
        sel?.removeAllRanges();
        range && sel?.addRange(range);
      }

      el.focus();
    }

    return this;
  }

  __onKeydown(ev: KeyboardEvent) {
    const { em } = this;
    const { onKeydown } = em.RichTextEditor.getConfig();

    if (onKeydown) {
      return onKeydown({ ev, rte: this, editor: em.getEditor() });
    }

    const { doc } = this;
    const cmdList = ['insertOrderedList', 'insertUnorderedList'];

    if (ev.key === 'Enter' && !cmdList.some((cmd) => doc.queryCommandState(cmd))) {
      doc.execCommand('insertLineBreak');
      ev.preventDefault();
    }
  }

  // insertPastHTML
  insertPastHTML(value: string | HTMLElement) {
    if(!value){
      return
    }
    const { doc ,el} = this;
    const sel = doc.getSelection();

    if (sel && sel.rangeCount) {
      const node = doc.createElement('div');
      const range = sel.getRangeAt(0);
      range.deleteContents();

      if (isString(value)) {
        node.innerHTML = value;
      } else if (value) {
        node.appendChild(value);
      }
      // 左右相反
      Array.prototype.slice.call(node.childNodes).forEach(nd => {
        range.insertNode(nd);
        // 关键：移动范围起点到新节点末尾
        range.setStartAfter(nd);
      });
      // 折叠光标
      range.collapse(false);

      sel.removeAllRanges();
      sel.addRange(range);
      el.focus();
    }
  }

  __onPaste(ev: Event) {
    // @ts-ignore
    const clipboardData = ev.clipboardData || window.clipboardData;
    const text = clipboardData.getData('text/plain');
    // const textHtml = clipboardData.getData('text/html');
    // Replace \n with <br> in case of plain text
    if (text) {
      let html = text.replace(/(?:\r\n|\r|\n)/g, '<br/>');
      // 替换 空格 unicode 编码参考 https://www.fileformat.info/info/unicode/char/0020/index.htm
      let content = html.replace(/\u00a0/ig, ' ');
      content = content.replace(/&nbsp;/ig, ' ');
      // insertHtml 会出现&nbsp 先使用 insertText 替代
      try{
        this.insertPastHTML(content.trim())
      }
      catch (e) {
        console.warn(e)
        this.doc.execCommand('insertHTML', false, content);
      }

      ev.preventDefault();
    }
  }

  /**
   * Sync actions with the current RTE
   */
  syncActions() {
    this.getActions().forEach((action) => {
      if (this.actionbar) {
        if (!action.state || (action.state && action.state(this, this.doc) >= 0)) {
          const event = action.event || 'click';
          const { btn } = action;
          if (btn) {
            (btn as any)[`on${event}`] = () => {
              action.result(this, action);
              this.updateActiveActions();
            };
          }
        }
      }
    });
  }

  /**
   * Add new action to the actionbar
   * @param {Object} action
   * @param {Object} [opts={}]
   */
  addAction(action: RichTextEditorAction, opts: { sync?: boolean } = {}) {
    const { sync } = opts;
    const actionbar = this.actionbarEl();

    if (actionbar) {
      const { icon, attributes: attr = {} } = action;
      const btn = document.createElement('span');
      btn.className = this.classes.button;
      action.btn = btn;

      for (let key in attr) {
        btn.setAttribute(key, attr[key]);
      }

      if (typeof icon == 'string') {
        btn.innerHTML = icon;
      } else {
        btn.appendChild(icon);
      }

      actionbar.appendChild(btn);
    }

    if (sync) {
      this.actions.push(action);
      this.syncActions();
    }
  }

  /**
   * Get the array of current actions
   * @return {Array}
   */
  getActions() {
    return this.actions;
  }

  /**
   * Returns the Selection instance
   * @return {Selection}
   */
  selection() {
    return this.doc.getSelection();
  }

  /**
   * Wrapper around [execCommand](https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand) to allow
   * you to perform operations like `insertText`
   * @param  {string} command Command name
   * @param  {any} [value=null Command's arguments
   */
  exec(command: string, value?: string) {
    this.doc.execCommand(command, false, value);
    try{
      // 更新selection
      setTimeout(()=>{
        this.propPageAction()
      },10)
    }
    catch (e) {
      console.warn(e)
    }
  }

  /**
   * Get the actionbar element
   * @return {HTMLElement}
   */
  actionbarEl() {
    return this.actionbar;
  }

  /**
   * clearStyle
   */
  clearAllHtmlStyle() {
    try{
      const {doc } = this;
      const sel = doc.getSelection();
      if (sel && sel.rangeCount) {
        const text=sel.toString()
        if(!text){
          return
        }
        // 获取第一个 Range 对象
        // @ts-ignore
        const range = sel.getRangeAt(0);
        const node = document.createElement('span');
        // @ts-ignore
        node.value=text
        range.deleteContents();
        node.innerHTML=text
        Array.prototype.slice.call(node.childNodes).forEach(nd => {
          range.insertNode(nd);
        });
        sel.removeAllRanges();
        sel.addRange(range);
      }


    }
    catch (e) {
      console.error(e)
    }
    try{
      // 更新selection
      setTimeout(()=>{
        this.propPageAction()
      },10)
    }
    catch (e) {
      console.warn(e)
    }
  }

  clearSelectionInlineStyle() {
    try{
      const selection:any = window.getSelection();

      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;

        // 检查选区是否完全在某个元素内
        if (container.nodeType === Node.ELEMENT_NODE && range.startContainer === container && range.endContainer === container) {
          // 提取出选中的内容
          const selectedText = range.extractContents();

          // 创建一个新的文本节点
          const textNode = document.createTextNode(selectedText.textContent || selectedText.innerText);

          // 将新的文本节点插入到原来的位置
          range.insertNode(textNode);

          // 重新选择处理后的文本
          range.selectNodeContents(textNode);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          // 如果选区跨越了多个元素，需要处理更复杂的情况
          // 这里简单地处理单个元素的情况
          console.warn("选区跨越了多个元素，当前只支持单个元素内的选区处理。");
        }
      }
    }
    catch (e) {
      console.warn(e)
    }
  }

  clearSelectionStyle() {
    try{
      const {doc } = this;
      // @ts-ignore
      let selection:any = doc.getSelection();
      if (selection.rangeCount > 0) {
        let range = selection.getRangeAt(0);
        let fragment = range.cloneContents();

        //@ts-ignore 递归函数，用于移除节点的内联样式和类名
        function stripFormatting(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 移除所有内联样式
            if (node.style) {
              node.style.cssText = '';
            }
            // 移除所有类名
            node.removeAttribute('class');
            node.removeAttribute('style');
            // 递归处理子节点
            for (let i = 0; i < node.childNodes.length; i++) {
              stripFormatting(node.childNodes[i]);
            }
          }
        }

        // 移除fragment中所有节点的内联样式
        stripFormatting(fragment);

        // 替换选区内容
        range.deleteContents();
        range.insertNode(fragment);

        // 重新选择处理后的文本
        range.selectNodeContents(fragment);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    catch (e) {
      console.warn(e)
    }
    try{
      // 更新selection
      setTimeout(()=>{
        this.propPageAction()
      },10)
    }
    catch (e) {
      console.warn(e)
    }

  }


  clearAllSelectionStyle() {
    try{
      const { em, doc, el } = this;
      // @ts-ignore
      let selection:any = doc.getSelection();
      const text=selection.toString()
      if(!text){
        console.warn('null text')
        return
      }

      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const fragment = range.extractContents(); // 提取出选中的内容

        // 创建一个新的文本节点
        const textNode = document.createTextNode(fragment.textContent || fragment.innerText);

        // 将新的文本节点插入到原来的位置
        range.insertNode(textNode);

        // 重新选择处理后的文本
        range.selectNodeContents(textNode);
        selection.removeAllRanges();
        selection.addRange(range);

        // 创建一个新的Range对象
        const newRange = document.createRange();
        // 选择element的所有子节点
        newRange.selectNodeContents(el);
        // 清除现有的选区
        selection.removeAllRanges();
        // 将新的Range对象添加到Selection中
        selection.addRange(newRange);
        // 将焦点设置到选区
        el.focus();

      }
    }
    catch (e) {
      console.warn(e)
    }
    try{
      // 更新selection
      setTimeout(()=>{
        this.propPageAction()
      },10)
    }
    catch (e) {
      console.warn(e)
    }
  }

  /**
   *
   * @param node 合并节点样式
   * @returns {*}
   */
  // @ts-ignore
  mergeTag(node:any) {
    console.log('node', node)
    console.log('node.textContent', node.textContent)
    if (node.nodeType === Node.ELEMENT_NODE) {
      const nodeStyle = node.getAttribute('style')
      // 如果是 span 标签，递归处理其子节点
      for (let child of node.childNodes) {
        console.log('child', child)
        console.log('node.innerText', node.textContent)
        console.log('child.innerText', child.textContent)
        if (child.textContent === node.textContent) {
          // 内容一样的子节点忽略 获取style
          const childStyle = child.getAttribute('style')
          if (childStyle) {
            const nodeStyleConfig:any = {}
            if (nodeStyle) {
              nodeStyle.split(';').map((item:any) => {
                const key = item.split(':')[0]
                const value = item.split(':')[1]
                if (key) {
                  nodeStyleConfig[key] = value
                }
              })
            }
            // 子节点样式覆盖
            childStyle.split(';').map((item:any) => {
              const key = item.split(':')[0]
              const value = item.split(':')[1]
              if (key) {
                nodeStyleConfig[key] = value
              }
            })
            console.log('nodeStyleConfig', nodeStyleConfig)
            // console.log('nodeStyleConfig.entries()',nodeStyleConfig.entries())
            let style:any = []
            Object.keys(nodeStyleConfig).forEach(key => {
              style.push(key + ':' + nodeStyleConfig[key])
            })
            console.log('style', style)
            node.setAttribute('style', style.join(';'))
            // 合并 nodeStyle 和  childStyle （childStyle 优先级高）
          }
          //  节点变成文本 创建一个新的文本节点并替换它
          const textNode = document.createTextNode(child.textContent);
          child.parentNode.replaceChild(textNode, child);
        }
        else if (!child.textContent) {
          // 删除 空节点
          child.remove()
        }
        else {
          // @ts-ignore
          this.mergeTag(child);
        }

      }
    }
    return node
  }

  /**
   * clearStyle
   */
  clearHtmlStyle(selText:string) {

    const { em, doc, el } = this;
    const sel = doc.getSelection();
    console.log('el',el)
    if (sel && sel.rangeCount) {

      try{
        const text=sel.toString()
        if(!text){
          return
        }
        // 获取第一个 Range 对象
        // @ts-ignore
        let curRange = sel.getRangeAt(0);



        // 获取选中范围的父节点
        // @ts-ignore
        let parentNode:HTMLElement = curRange.commonAncestorContainer;

        console.log('parentNode before',parentNode)
        console.log('parentNode.nodeType',parentNode.nodeType)
        console.log('parentNode.nodeType===Node.ELEMENT_NODE',parentNode.nodeType===Node.ELEMENT_NODE)
        console.log('parentNode.nodeType===Node.TEXT_NODE',parentNode.nodeType===Node.TEXT_NODE)
        if(parentNode?.parentElement&&parentNode?.parentElement?.nodeType===Node.ELEMENT_NODE){
          // @ts-ignore
          parentNode.parentElement.removeAttribute('style')

          try{
            // @ts-ignore
            this.mergeTag(parentNode.parentElement)
          }
          catch (e) {
            console.warn(e)
          }

          // 创建一个新的Range对象
          const newRange = document.createRange();
          // 选择element的所有子节点
          newRange.selectNodeContents(el);
          const selection:any=doc.getSelection()
          // 清除现有的选区
          selection.removeAllRanges();
          // 将新的Range对象添加到Selection中
          selection.addRange(newRange);
          // 将焦点设置到选区
          el.focus();

          this.updateActiveActions()
        }
        else{
          this.clearAllHtmlStyle()
        }
      }
      catch (e) {
        console.error(e)
      }
      try{
        // 更新selection
        setTimeout(()=>{
          this.propPageAction()
        },10)
      }
      catch (e) {
        console.warn(e)
      }

    }
  }

  /**
   * changeUnderlineStyle
   * @param  {string} value HTML string
   */
  changeUnderlineStyle() {
    const {  doc } = this;
    const selection = doc.getSelection();

    try{
      console.log('changeUnderlineStyle selection',selection)

      // 检查是否有选区
      if (selection && selection.rangeCount) {

        // 获取第一个范围
        const range = selection.getRangeAt(0);

        // 获取选区开始位置的节点
        let startNode:any = range.startContainer;
        console.log('startNode\t',startNode)
        if (startNode.nodeType === Node.TEXT_NODE ) {
          this.exec('underline')
        }else if(startNode){
          const node=startNode
          // 背景图片
          const styleStr = node.getAttribute('style');
          const styleStrArr = styleStr ? styleStr.split(';') : [];
          const styleConfig:any = {};
          styleStrArr.forEach((styleItem:string) => {
            const styleStrVal = styleItem.trim();
            let styleKey = '';
            let styleVal = '';
            if (styleStrVal) {
              for (let i = 0, getPoint = false; i < styleStrVal.length; ++i) {
                if (styleStrVal[i] === ':' && !getPoint) {
                  getPoint = true;
                } else if (!getPoint) {
                  styleKey += styleStrVal[i];
                } else {
                  styleVal += styleStrVal[i];
                }
              }
              styleConfig[styleKey.trim()] = styleVal.trim();
            }
          });
          const key='text-decoration'
          const val='underline'
          if(styleConfig[key]===val){
            delete styleConfig[key]
          }
          else{
            styleConfig[key]=val
          }
          let newStyleVal = '';
          newStyleVal = Object.keys(styleConfig)
              .map((key) => {
                return `${key}:${styleConfig[key]}`;
              })
              .join(';');
          if (newStyleVal) {
            node.setAttribute('style', newStyleVal);
          } else {
            node.removeAttribute('style', newStyleVal);
          }
          console.log('newStyleVal\t',newStyleVal)
          // 删除再写入
          this.exec('delete')
          this.exec('insertHTML',`<span style="${newStyleVal}">${node.innerHTML}</span>`)
        }

      } else {
        console.log("No selection found.");
      }

    }
    catch (e) {
      console.error('changeUnderlineStyle error \t',e)
    }

    try{
      // 更新selection
      setTimeout(()=>{
        this.propPageAction()
      },10)
    }
    catch (e) {
      console.warn(e)
    }
  }

  // @ts-ignore  向上查找 a 标签
  findParentLinkTag(currentNode:any,selectText:any):{isExistLinkTag:boolean,linkTag?:any}{
    console.log('selectText',selectText)
    try{
      if(currentNode?.tagName==='A'&&currentNode.innerText===selectText){
        const fontDocStyle = currentNode?.getAttribute?.('style');
        const styleConfig:any = {};
        try{
          const fontDocStyleArr=fontDocStyle?fontDocStyle.split(';'):[]
          fontDocStyleArr.forEach((styleItem:string) => {
            const styleStrVal = styleItem.trim();
            let styleKey = '';
            let styleVal = '';
            if (styleStrVal) {
              for (let i = 0, getPoint = false; i < styleStrVal.length; ++i) {
                if (styleStrVal[i] === ':' && !getPoint) {
                  getPoint = true;
                } else if (!getPoint) {
                  styleKey += styleStrVal[i];
                } else {
                  styleVal += styleStrVal[i];
                }
              }
              styleConfig[styleKey.trim()] = styleVal.trim();
            }
          });
        }
        catch (e) {
          console.error(e)
        }
        if(styleConfig['text-decoration']==='none'){
          // 无需处理
          return {
            isExistLinkTag:true,
            linkTag:currentNode
          }
        }
        styleConfig['text-decoration']='none'
        const styleVal=Object.keys(styleConfig).map(key=>{
          return `${key}:${styleConfig[key]}`
        }).join(';');
        currentNode.setAttribute('style',styleVal)
        console.log('currentNode',currentNode)
        console.log('em',this.em)
        // Sync content if there is an active RTE
        const editingCmp = this.em.getEditing();

        // @ts-ignore
        editingCmp && editingCmp.trigger('sync:content', { noCount: true });
        // console.info('sync:content success\t',styleVal)
        return {
          isExistLinkTag:true,
          linkTag:currentNode
        }
      }
      else if(currentNode?.tagName==='DIV'||currentNode?.tagName==='TD'){
        // 结束
        return {  isExistLinkTag:false,
          linkTag:null
        }
      }
      else{
        // 向上查找
        return this.findParentLinkTag(currentNode.parentNode,selectText)
      }

    }
    catch (e){
      console.error(e)
      return {
        isExistLinkTag:true,
        linkTag:currentNode
      }
    }
  }
  // @ts-ignore  向上查找 a 标签 标记下划线
  controlLinkUnderlineAction(currentNode:any):{isLink:boolean,href?:any,target?:any,isUnderLine?:any,styleConfig?:any}{
    try{
      if(currentNode?.tagName==='A'){
        const styleStr = currentNode?.getAttribute('style');
        const styleStrArr = styleStr ? styleStr.split(';') : [];
        const styleConfig:any = {};
        styleStrArr.forEach((styleItem:any) => {
          const styleStrVal = styleItem.trim();
          if (styleStrVal) {
            const styleItemArr = styleStrVal.split(':');
            if (styleItemArr.length > 1) {
              const styleKey = styleItemArr[0].trim();
              const styleVal = styleItemArr[1].trim();
              styleConfig[styleKey]=styleVal
            }
          }
        });
        const key='text-decoration'
        const val='none'
        const isUnderLine=styleConfig[key]!==val
        return {
          isLink:true,
          href:currentNode.getAttribute('href'),
          target:currentNode.getAttribute('target'),
          isUnderLine:isUnderLine,
          styleConfig:styleConfig
        }
      }
      else if(currentNode?.tagName==='DIV'||currentNode?.tagName==='TD'){
        // 结束
        return {isLink:false,href:'',target:'',isUnderLine:false,styleConfig:{}}
      }
      else{
        // 向上查找
        return this.controlLinkUnderlineAction(currentNode.parentNode)
      }

    }
    catch (e){
      console.error(e)
      return {isLink:false,href:'',target:'',isUnderLine:false,styleConfig:{}}
    }
  }

  // 更新链接标签 下划线
  updateLinkTagUnderline(){
    try{
      const { doc } = this;
      const selection = doc.getSelection();
      const {displayText,htmlVal}=this.getSelectionVal()
      if(selection && selection.rangeCount&&displayText){
        const range = selection.getRangeAt(0);
        let startNode:any = range.startContainer;
        if (startNode.nodeType === Node.TEXT_NODE && startNode.parentNode) {
          startNode = startNode.parentNode;  // 如果是文本节点，则获取其父节点
        }
        const {isLink,isUnderLine,styleConfig,target,href} =this.controlLinkUnderlineAction(startNode)
        if(isLink){
          // 取消链接
          this.exec('unlink')
          // 取反
          const newStyleConfig={
            ...styleConfig,
            'text-decoration' :isUnderLine?'none':'underline'
          }
          const styleStr=Object.keys(newStyleConfig).map(key=>{
            return `${key}:${newStyleConfig[key]}`
          }).join(';')
          console.log('styleStr',styleStr)
          //   添加链接
          this.insertHTML(
              `<a href="${href}" target="${target}" style="${styleStr}">${displayText}</a>`,
              {
                select: false,
              })
        }
        else{
          // 取消链接
          this.exec('underline')
        }
      }
    }
    catch (e) {
      console.error(e)
    }
  }

  /**
   * updateLinkTextContentTag
   * @param  {string} value HTML string
   */
  updateLinkTextContentTag(color:string,fontSize:string) {
    const { doc } = this;
    const selection = doc.getSelection();

    try{

      // 检查是否有选区
      if (selection && selection.rangeCount) {

        // 获取第一个范围
        const range = selection.getRangeAt(0);

        // 获取选区开始位置的节点
        let startNode:any = range.startContainer;
        if (startNode.nodeType === Node.TEXT_NODE && startNode.parentNode) {
          startNode = startNode.parentNode;  // 如果是文本节点，则获取其父节点
        }
        const startNodeName = startNode.nodeName?.toUpperCase();
        const startNodeIsNode = startNode.nodeType === Node.ELEMENT_NODE;
        // 常规链接
        if (startNodeName === 'A' && startNodeIsNode) {
          const fontDocStyle = startNode?.getAttribute?.('style');
          const styleConfig:any = {};
          try{
            const fontDocStyleArr=fontDocStyle?fontDocStyle.split(';'):[]
            fontDocStyleArr.forEach((styleItem:string) => {
              const styleStrVal = styleItem.trim();
              let styleKey = '';
              let styleVal = '';
              if (styleStrVal) {
                for (let i = 0, getPoint = false; i < styleStrVal.length; ++i) {
                  if (styleStrVal[i] === ':' && !getPoint) {
                    getPoint = true;
                  } else if (!getPoint) {
                    styleKey += styleStrVal[i];
                  } else {
                    styleVal += styleStrVal[i];
                  }
                }
                styleConfig[styleKey.trim()] = styleVal.trim();
              }
            });
          }
          catch (e) {
            console.error(e)
          }
          styleConfig['color']=color
          styleConfig['text-underline']='none'
          if(fontSize){
            styleConfig['font-size']=fontSize
          }

          const startNodeHtml=startNode.innerHTML
          const span=document.createElement('span')
          span.innerHTML=startNodeHtml
          const selectText=doc.getSelection()?.toString();
          if(selectText){
            span.innerText=selectText
            const href=startNode.getAttribute('href')
            const target=startNode.getAttribute('target')
            this.exec('unlink');
            this.exec('delete')
            const styleVal=Object.keys(styleConfig).map(key=>{
              return `${key}:${styleConfig[key]}`
            }).join(';');
            this.exec('insertHTML',`<a style="${styleVal}" href="${href}" target="${target}">${span.innerHTML}</a>`);
          }
        }
      } else {
        console.log("No selection found.");
      }

    }
    catch (e) {
      console.error(e)
    }

    try{
      // 更新selection
      setTimeout(()=>{
        this.propPageAction()
      },10)
    }
    catch (e) {
      console.warn(e)
    }
  }

  /**
   * updateTextContentTag
   * @param  {string} value HTML string
   */
  updateTextContentTag(value: string | HTMLElement,select?:boolean) {
    const {  em,doc, el } = this;
    const selection = doc.getSelection();

    try{
      console.log('updateTextContentTag selection',selection)

      // 检查是否有选区
      if (selection && selection.rangeCount) {

        // 获取第一个范围
        const range = selection.getRangeAt(0);

        // 获取选区开始位置的节点
        let startNode:any = range.startContainer;
        if (startNode.nodeType === Node.TEXT_NODE && startNode.parentNode) {
          startNode = startNode.parentNode;  // 如果是文本节点，则获取其父节点
        }

        // 获取选区结束位置的节点
        let endNode:any = range.endContainer;
        if (endNode.nodeType === Node.TEXT_NODE && endNode.parentNode) {
          endNode = endNode.parentNode;  // 如果是文本节点，则获取其父节点
        }
        const startNodeName = startNode.nodeName?.toUpperCase();

        const startNodeIsNode = startNode.nodeType === Node.ELEMENT_NODE;
        // 常规链接
        if (startNodeName === 'A' && startNodeIsNode) {
          startNode.setAttribute('style','color:transparent;text-decoration:none')
          const startNodeHtml=startNode.innerHTML
          this.exec('delete')
          this.exec('insertHTML',`<a style="color:transparent;text-decoration:none" href="${startNode.getAttribute('href')}" target="${startNode.getAttribute('target')}">${startNodeHtml}</a>`)
        }

        const endNodeName = endNode.nodeName?.toUpperCase();

        const endNodeIsNode = endNode.nodeType === Node.ELEMENT_NODE;
        // 常规链接
        if (endNodeName === 'A' && endNodeIsNode) {
          endNode.setAttribute('style','color:transparent;text-decoration:none')
        }


        // 如果你只想处理单一的节点，可以检查是否在同一节点内
        if (startNode === endNode) {
          console.log("Selected content is within a single node: ", startNode);
        } else {
          console.log("Selected content spans across multiple nodes.");
        }
      } else {
        console.log("No selection found.");
      }

    }
    catch (e) {
      console.error(e)
    }

    try{
      // 更新selection
      setTimeout(()=>{
        this.propPageAction()
      },10)
    }
    catch (e) {
      console.warn(e)
    }
  }

  cleanSelectedDomStyles() {
    try{
      const selection:any = this.doc.getSelection();
      const range:any = document.createRange();

      // 选中整个元素内容
      range.selectNodeContents(this.em.getSelected()?.view?.el?.querySelector('div'));

      selection.removeAllRanges();
      selection.addRange(range);
      if (!selection.rangeCount) return;

      // 块级元素定义（保留结构）
      const BLOCK_TAGS = new Set(['BR',]);
      // 需要完全移除的冗余标签
      const REMOVE_TAGS = new Set(['FONT', 'SPAN', 'B', 'I', 'U', 'STRONG', 'EM', 'A', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6','FONT']);

      // 主处理函数
      // @ts-ignore
      function processNode(node) {
        // 文本节点处理
        if (node.nodeType === Node.TEXT_NODE) {
          return cleanTextNode(node);
        }

        // 元素节点处理
        const tagName = node.tagName.toUpperCase();

        // 需要移除的标签直接处理子节点
        if (REMOVE_TAGS.has(tagName)) {
          return processChildNodes(node);
        }

        // 创建新节点
        const newNode = document.createElement(tagName);

        // 块级元素保留结构
        if (BLOCK_TAGS.has(tagName)) {
          // @ts-ignore
          newNode.append(...processChildNodes(node));
          return newNode;
        }

        // 其他标签扁平处理
        return processChildNodes(node);
      }

      // 处理子节点（核心逻辑）
      // @ts-ignore
      function processChildNodes(node:any) {
        const fragment = document.createDocumentFragment();
        Array.from(node.childNodes).forEach(child => {
          const processed = processNode(child);
          if (processed) {
            if (processed.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
              fragment.append(...processed.childNodes);
            } else {
              fragment.appendChild(processed);
            }
          }
        });
        return fragment;
      }

      // 清理文本节点
      // @ts-ignore
      function cleanTextNode(node) {
        const text = node.nodeValue
            .replace(/\s+/g, ' ')       // 压缩连续空白
            .replace(/^ | $/g, '');      // 去除首尾空格
        return text ? document.createTextNode(text) : null;
      }

      // 执行清理
      const cleanedFragment = processNode(this.em.getSelected()?.view?.el?.querySelector('div'));

      // 替换原内容
      range.deleteContents();
      range.insertNode(cleanedFragment);

      // 后处理优化
      const parent = range.commonAncestorContainer;
      parent.normalize(); // 合并相邻文本节点
      selection.removeAllRanges();
    }
    catch (e) {
      console.error(e)
    }
  }

  /**
   * Set custom HTML to the selection, useful as the default 'insertHTML' command
   * doesn't work in the same way on all browsers
   * @param  {string} value HTML string
   */
  insertHTML(value: string | HTMLElement, { select }: { select?: boolean } = {}) {
    const { em, doc, el } = this;
    const sel = doc.getSelection();

    if (sel && sel.rangeCount) {
      const model = getComponentModel(el) || em.getSelected();
      const node = doc.createElement('div');
      const range = sel.getRangeAt(0);
      range.deleteContents();

      if (isString(value)) {
        node.innerHTML = value;
      } else if (value) {
        node.appendChild(value);
      }

      Array.prototype.slice.call(node.childNodes).forEach((nd) => {
        range.insertNode(nd);
      });

      sel.removeAllRanges();
      sel.addRange(range);
      el.focus();

      if (select && model) {
        model.once('rte:disable', () => {
          const toSel = model.find(`[${customElAttr}]`)[0];
          if (!toSel) return;
          em.setSelected(toSel);
          toSel.removeAttributes(customElAttr);
        });
        model.trigger('disable');
      }
    }

    try{
      // 更新selection
      setTimeout(()=>{
        this.propPageAction()
      },10)
    }
    catch (e) {
      console.warn(e)
    }
  }
  // link 冒泡事件
  linkPopEvent(rte:any,cb:any){
    // @ts-ignore 链接事件
    this?.em?._config?.richProps?.linkAction?.(rte,cb)
  }

  // placeholder 冒泡事件
  placeholderPopEvent(rte:any,cb:any){
    // @ts-ignore 占位符事件
    this?.em?._config?.richProps?.placeholderAction?.(rte,cb)
  }
}
