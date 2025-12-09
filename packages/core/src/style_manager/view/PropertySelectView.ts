import PropertySelect from '../model/PropertySelect';
import PropertyView from './PropertyView';
// localstorage缓存
const localWebFontStoreKey='mailEditorWebFontStore';
// 默认字体
const defaultFontData = [
  { name: 'Arial', value: 'Arial' },
  { name: 'Arial Black', value: 'Arial Black' },
  { name: 'Brush Script MT', value: 'Brush Script MT' },
  { name: 'Comic Sans MS', value: 'Comic Sans MS' },
  { name: 'Courier New', value: 'Courier New' },
  { name: 'Georgia', value: 'Georgia' },
  { name: 'Helvetica', value: 'Helvetica' },
  { name: 'Impact', value: 'Impact' },
  { name: 'Lucida Sans Unicode', value: 'Lucida Sans Unicode' },
  { name: 'Tahoma', value: 'Tahoma' },
  { name: 'Times New Roman', value: 'Times New Roman' },
  { name: 'Trebuchet MS', value: 'Trebuchet MS' },
  { name: 'Verdana', value: 'Verdana' },
  { name: 'Palatino', value: 'Palatino' },
];

// dom里面的文本出现不同字体
// @ts-ignore
const isDifferentFirstFont=(node:HTMLElement,firstFontFamily?:string|null)=>{
  const nodeName = node.nodeName?.toUpperCase();
  // span
  if (['DIV','SPAN','P'].includes(nodeName)) {
    const styleStr = node.getAttribute('style');
    const styleStrArr = styleStr ? styleStr.split(';') : [];
    styleStrArr.forEach((styleItem) => {
      const styleStrVal = styleItem.trim();
      if (styleStrVal) {
        const styleItemArr = styleStrVal.split(':');
        if (styleItemArr.length > 1) {
          const styleKey = styleItemArr[0].trim();
          const styleVal = styleItemArr[1].trim();
          if (styleKey === 'font-family') {
            const firstFontAttr=styleVal.split(',')[0]
            if(firstFontAttr!==firstFontFamily&&firstFontFamily){
              return true
            }
            else if(!firstFontFamily){
              firstFontFamily=firstFontAttr
            }
          }
        }
      }
    });
  }
  else if(nodeName==='FONT'){
    const firstFontAttr=node.getAttribute('face')
    if(firstFontAttr&&firstFontAttr!==firstFontFamily&&firstFontFamily){
      return true
    }
    else if(!firstFontFamily){
      firstFontFamily=firstFontAttr
    }
  }
  for (let i = 0; i < node.childNodes.length; i++) {
    // @ts-ignore
    const findRes=isDifferentFirstFont(node.childNodes[i],firstFontFamily);
    if(findRes){
      return findRes
    }
  }
  return false
}
export default class PropertySelectView extends PropertyView {
  templateInput() {
    const { pfx, ppfx, model , em } = this;
    if(model?.attributes?.property==='font-family' && em.t('styleManager.addFontButton')){

      return `
      <div class="${ppfx}field ${ppfx}select" style="flex: 1;">
        <span id="${pfx}input-holder"></span>
        <div class="${ppfx}sel-arrow">
          <div class="${ppfx}d-s-arrow"></div>
        </div>
      </div>
      
      <div style="flex: 1;">
        <button id="${pfx}-add-font" class="${pfx}-add-font-btn">
             ${em.t('styleManager.addFontButton')}
        </button>
      </div>
    `;
    }
    return `
      <div class="${ppfx}field ${ppfx}select">
        <span id="${pfx}input-holder"></span>
        <div class="${ppfx}sel-arrow">
          <div class="${ppfx}d-s-arrow"></div>
        </div>
      </div>
    `;
  }

  constructor(o: any) {
    super(o);
    this.listenTo(this.model, 'change:options', this.updateOptions);
  }

  updateOptions() {
    delete this.input;
    this.onRender();
  }

  onRender() {
    const { pfx,em } = this;
    const model = this.model as PropertySelect;
    const options = model.getOptions();

    if (!this.input) {
      const optionsRes: string[] = [];



      if(model?.attributes?.property==='font-family' && em.t('styleManager.addFontButton')){
        // 占位
        optionsRes.push(`<option value="-" style="display: none">-</option>`);



        const fontOptions = defaultFontData.map((item:any) => {
          const font=item.value
          return { id: font, label: font.split(',')[0],style:`font-family:${font}` };
        });
        fontOptions.forEach((option:{id:any,label:any,style:any}) => {
          const id = option.id;
          const name = option.label;
          const style = option.style ? option.style.replace(/"/g, '&quot;') : '';
          const styleAttr = style ? `style="${style};cursor: pointer;"` : '';
          const value = id.replace(/"/g, '&quot;');
          optionsRes.push(`<option value="${value}" ${styleAttr} class="option-item">${name}</option>`);
        });


        let webFontConfig:any= [];
        const selectWebFontStr = localStorage.getItem(localWebFontStoreKey);
        if (selectWebFontStr) {
          const selectWebFontConfig = JSON.parse(selectWebFontStr);
          const selectArray=[...selectWebFontConfig]
          webFontConfig=selectArray.map((item:any)=>{
            return {
              ...item,
            }
          });
        };

        const googleGroupId=`${pfx}-google-font-option`
        // 追加 开始样式
        optionsRes.push(`<optgroup label="${em.t('styleManager.addWebFontLabel')}" class="group-option-box">`)
        // 追加 结束样式
        optionsRes.push(`</optgroup>`)
        if(webFontConfig.length){
          webFontConfig.forEach((item:{name:string,value:string})=>{
            const {name,value}=item
            const styleAttr=`style="font-family:${value};cursor: pointer;"`
            optionsRes.push(`<option value="${value}" ${styleAttr} class="group-option-item">${name}</option>`);
          })
        }


        const inputH = this.el.querySelector(`#${pfx}input-holder`)!;

        // innerHTML
        inputH.innerHTML = `<select id="${googleGroupId}">${optionsRes.join('')}</select>`;

        this.input = inputH.firstChild as HTMLInputElement;

        this.el.style.width='100%'
        // 事件绑定
        this.el.querySelector(`#${pfx}-add-font`)?.addEventListener('click',(e)=> {
          this.config.em._config?.fontManager?.addFontAction({
            model:model,
            googleGroupId:googleGroupId
          })
        })

      }
      else{
        const options = model.getOptions();
        options.forEach(option => {
          const id = model.getOptionId(option);
          const name = model.getOptionLabel(id);
          const style = option.style ? option.style.replace(/"/g, '&quot;') : '';
          const styleAttr = style ? `style="${style}"` : '';
          const value = id.replace(/"/g, '&quot;');
          optionsRes.push(`<option value="${value}" ${styleAttr}>${name}</option>`);

        });



        const inputH = this.el.querySelector(`#${pfx}input-holder`)!;
        inputH.innerHTML = `<select>${optionsRes.join('')}</select>`;
        this.input = inputH.firstChild as HTMLInputElement;
      }

    }
  }

  // web下拉选择项的添加
  renderWebSelect(displayText:string,webFontConfig:any[]){
    // console.log('渲染 字体下拉选择')
    const { pfx } = this;
    const googleGroupId=`${pfx}-google-font-option`

    const curDom = document.getElementById(googleGroupId);
    console.log('curDom',curDom)
    if (curDom) {
      const optionsRes = [];
      const defaultOptions = [...defaultFontData];
      defaultOptions.forEach((item: { name: string; value: string }) => {
        const { name, value } = item;
        const styleAttr = `style="font-family:${value}"`;
        optionsRes.push(`<option value="${value}" ${styleAttr}>${name}</option>`);
      });
      // 追加 开始样式
      optionsRes.push(`<optgroup label="Google fonts" class="group-option-box">`);
      // 追加 结束样式
      optionsRes.push(`</optgroup>`);
      // 追加 options
      if (webFontConfig.length) {
        webFontConfig.forEach((item: { name: string; value: string }) => {
          const { name, value } = item;
          const styleAttr = `style="font-family:${value}"`;
          optionsRes.push(
              `<option value="${value}" ${styleAttr}>${name}</option>`,
          );
        });
      }
      curDom.innerHTML = optionsRes.join('');
      // @ts-ignore
      curDom.value=displayText
    }
  }

  __setValueInput(value: string) {
    const model = this.model as PropertySelect;
    const input = this.getInputEl();
    const firstOpt = model.getOptions()[0];
    const firstId = firstOpt ? model.getOptionId(firstOpt) : '';

    if(model?.attributes?.property==='font-family'){
      const selected = this.em?.getSelected();
      let displayText=(value || firstId).split(',')[0]||''
      if(selected) {

        const htmlString = selected.toHTML();
        // 创建一个DOMParser实例
        const parser = new DOMParser();
        // 解析HTML字符串
        const doc = parser.parseFromString(htmlString, "text/html");
        // 存在差异 显示 -
        if(isDifferentFirstFont(doc.body)){
          displayText='-'
        }
        else if(displayText){
          console.log('displayText',displayText)
          let webFontConfig:any= [];
          const selectWebFontStr = localStorage.getItem(localWebFontStoreKey);
          if (selectWebFontStr) {
            const selectWebFontConfig = JSON.parse(selectWebFontStr);
            const selectArray=[...selectWebFontConfig]
            webFontConfig=selectArray.map((item:any)=>{
              return {
                ...item,
              }
            });
          };

          // 网络字体判断 默认字体 和 网络字体也没有找到的情况
          console.log('defaultFontData',defaultFontData)
          console.log('webFontConfig',webFontConfig)
          if(defaultFontData.every((item:any)=>item.value!==displayText)&&webFontConfig.every((item:any)=>item.value!==displayText)){
            console.info('not exist font',displayText)
            webFontConfig.push({name:displayText,value:displayText})
            localStorage.setItem(localWebFontStoreKey,JSON.stringify(webFontConfig));
            console.log('添加网络字体 自动识别渲染',webFontConfig)
            try{
              this.renderWebSelect(displayText,webFontConfig)
            }
            catch (e) {
              console.error('添加网络字体 自动识别失败',e)
            }
          }
          else{
            console.info('exist font',displayText)
          }
        }
      }
      const input = this.getInputEl();
      if(input){
        input.value = displayText
        input.style.fontFamily = (value || firstId).split(',')[0]||'Arial'
      }
    }
    else{
      // console.log('value',value)
      const input = this.getInputEl();
      input && (input.value = value || firstId);
    }
  }
}
