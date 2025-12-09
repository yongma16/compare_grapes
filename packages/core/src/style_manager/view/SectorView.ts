import { View } from '../../common';
import EditorModel from '../../editor/model/Editor';
import html from '../../utils/html';
import { StyleManagerConfig } from '../config/config';
import Sector from '../model/Sector';
import PropertiesView from './PropertiesView';

export default class SectorView extends View<Sector> {
  em: EditorModel;
  config: StyleManagerConfig;
  pfx: string;

  constructor(o: { config: StyleManagerConfig; model?: Sector }) {
    super(o);
    const config = o.config || {};
    const { model } = this;
    // @ts-ignore
    const { em } = config;
    this.config = config;
    this.em = em;
    this.pfx = config.stylePrefix || '';
    this.listenTo(model, 'destroy remove', this.remove);
    this.listenTo(model, 'change:open', this.updateOpen);
    this.listenTo(model, 'change:visible', this.updateVisibility);
  }

  template({ pfx, label }: { pfx?: string; label: string }) {
    const icons = this.em?.getConfig().icons;
    const iconCaret = icons?.caret || '';
    const clsPfx = `${pfx}sector-`;

    return html`
      <div class="${clsPfx}title" data-sector-title>
        <div class="${clsPfx}caret">$${iconCaret}</div>
        <div class="${clsPfx}label">${label}</div>
      </div>
    `;
  }

  events() {
    return {
      'click [data-sector-title]': 'toggle',
    };
  }

  isCustomVideo(){
    return this.model.get('name') == 'Video'
  }

  // 自定义表单
  isCustomForm(){
    return this.model.get('name') == 'Form'
  }
  updateOpen() {
    const { $el, model, pfx } = this;
    const isOpen = model.isOpen();
    $el[isOpen ? 'addClass' : 'removeClass'](`${pfx}open`);
    this.getPropertiesEl().style.display = isOpen ? '' : 'none';

    if(this.isCustomVideo()){
      try{
        // @ts-ignore
        this.config?.em?._config?.videoManager?.updateOpen?.({
          isOpen: isOpen
        })
      }
      catch (e) {
        console.error(e)
      }
    }
    else if(this.isCustomForm()){
      try{
        // @ts-ignore
        this.config?.em?._config?.formManager?.updateOpen?.({
          isOpen: isOpen
        })
      }
      catch (e) {
        console.error(e)
      }
    }
  }

  updateVisibility() {
    this.el.style.display = this.model.isVisible() ? '' : 'none';
  }

  getPropertiesEl() {
    const { $el, pfx } = this;
    return $el.find(`.${pfx}properties`).get(0)!;
  }

  toggle() {
    const { model } = this;
    model.setOpen(!model.get('open'));
  }

  renderProperties() {
    const { model, config, pfx } = this;
    const objs = model.get('properties');

    if(objs) {
      if(this.isCustomVideo()){
        try{
          const virtualDom=document.createElement('div')
          virtualDom.classList.add(`${pfx}properties`)
          const childEd=document.createElement('div')
          childEd.classList.add('video-placeholder-child')
          childEd.setAttribute('tag','video-placeholder-child')
          virtualDom.append(childEd)
          this.$el.append(virtualDom)
          // @ts-ignore
          this.config?.em?._config?.videoManager?.renderProperties?.({
            childEl: childEd,
            parentEl: virtualDom,
          })
        }
        catch (e) {
          console.error(e)
        }
      }
      else if(this.isCustomForm()){
        try{
          const virtualDom=document.createElement('div')
          virtualDom.classList.add(`${pfx}properties`)
          const childEd=document.createElement('div')
          childEd.classList.add('form-placeholder-child')
          childEd.setAttribute('tag','form-placeholder-child')
          virtualDom.append(childEd)
          this.$el.append(virtualDom)
          // @ts-ignore
          this.config?.em?._config?.formManager?.renderProperties?.({
            childEl: childEd,
            parentEl: virtualDom,
          })
        }
        catch (e) {
          console.error(e)
        }
      }
      else{
        const view = new PropertiesView({ collection: objs, config });
        this.$el.append(view.render().el);
      }

    }
  }

  render() {
    const { pfx, model, $el } = this;
    const id = model.getId();
    const label = model.getName();
    $el.html(this.template({ pfx, label }));
    this.renderProperties();
    $el.attr('class', `${pfx}sector ${pfx}sector__${id} no-select`);
    this.updateOpen();
    return this;
  }
}
