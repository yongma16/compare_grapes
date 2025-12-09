import { $ } from '../../common';
import { CommandObject } from './CommandAbstract';

export default {
  run(editor, sender) {
    this.sender = sender;

    const em = editor.getModel();

    const config = editor.Config;
    const pfx = config.stylePrefix;
    const tm = editor.TraitManager;
    const confTm = tm.getConfig();
    let panelC;

    if (confTm.appendTo) return;

    if (!this.$cn) {
      this.$cn = $('<div></div>');
      this.$cn2 = $('<div></div>');
      this.$cn.append(this.$cn2);
      this.$header = $('<div>').append(
          `<div class="${confTm.stylePrefix}header">${editor.t('styleManager.empty')}</div>`
      );
      this.$cn.append(this.$header);

      if (confTm.custom) {
        tm.__trgCustom({ container: this.$cn2.get(0) });
      } else {
        this.$cn2.append(`<div class="trail-header-box" id="trail-header-box-id">${em.t('traitManager.headerTitle')}</div>`);
        this.$cn2.append(`<div class="${pfx}traits-label">${em.t('traitManager.label')}</div>`);
        this.$cn2.append(tm.render());
      }

      var panels = editor.Panels;

      if (!panels.getPanel('views-container')) {
        // @ts-ignore
        panelC = panels.addPanel({ id: 'views-container' });
      } else {
        panelC = panels.getPanel('views-container');
      }

      panelC?.set('appendContent', this.$cn.get(0)).trigger('change:appendContent');

      this.target = editor.getModel();
      this.listenTo(this.target, 'component:toggled', this.toggleTm);
    }

    if (!this.$cnt) {
      const config = editor.getConfig();
      const { Panels, DeviceManager, SelectorManager, StyleManager } = editor;
      const trgEvCnt = 'change:appendContent';
      const $cnt = $('<div></div>');
      const $cntInner = $('<div></div>');
      const $cntSlm = $('<div></div>');
      const $cntSm = $('<div></div>');
      this.$cnt = $cnt;
      this.$cntInner = $cntInner;
      $cntInner.append($cntSlm);
      $cntInner.append($cntSm);
      $cnt.append($cntInner);

      // Device Manager
      if (DeviceManager && config.showDevices) {
        const devicePanel = Panels.addPanel({ id: 'devices-c' });
        const dvEl = DeviceManager.render();
        devicePanel.set('appendContent', dvEl).trigger(trgEvCnt);
      }

      // Selector Manager container
      const slmConfig = SelectorManager.getConfig();
      if (slmConfig.custom) {
        SelectorManager.__trgCustom({ container: $cntSlm.get(0) });
      } else if (!slmConfig.appendTo) {
        $cntSlm.append(SelectorManager.render([]));
      }

      // Style Manager
      this.sm = StyleManager;
      const smConfig = StyleManager.getConfig();
      // const pfx = smConfig.stylePrefix;
      // this.$header = $(`<div class="${pfx}header">${editor.t('styleManager.empty')}</div>`);
      // $cnt.append(this.$header);

      if (smConfig.custom) {
        StyleManager.__trgCustom({ container: $cntSm.get(0) });
      } else if (!smConfig.appendTo) {
        $cntSm.append(StyleManager.render());
      }

      // Create panel if not exists
      const pnCnt = 'views-container';
      const pnl = Panels.getPanel(pnCnt) || Panels.addPanel({ id: pnCnt });

      // Add all containers to the panel
      pnl.set('appendContent', $cnt).trigger(trgEvCnt);

      // Toggle Style Manager on target selection
      const em = editor.getModel();
      this.listenTo(em, StyleManager.events.target, this.toggleSm);
    }

    this.toggleSm();
  },

  /**
   * Toggle Style Manager visibility
   * @private
   */
  toggleSm() {
    const { sender, sm, $cntInner, $header } = this;
    if ((sender && sender.get && !sender.get('active')) || !sm) return;

    if (sm.getSelected()) {
      $cntInner?.show();
      $header?.hide();
    } else {
      $cntInner?.hide();
      $header?.show();
    }

    // trail
    if (this.target.getSelectedAll().length === 1) {
      this.$cn2.show();
      this.$header.hide();
    } else {
      this.$cn2.hide();
      this.$header.show();
    }
  },

  stop() {
    this.$cntInner?.hide();
    this.$header?.hide();
    // trail
    this.$cn2 && this.$cn2.hide();
    this.$header && this.$header.hide();
  },
} as CommandObject<{}, { [k: string]: any }>;
