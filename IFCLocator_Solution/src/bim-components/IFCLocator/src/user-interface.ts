import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import { IFCLocator } from "..";

export const IFCLocatorUI = (components: OBC.Components) => {
  const ifclocator = components.get(IFCLocator);

  const toolbarSection = BUI.Component.create(() => {
    return BUI.html`
      <bim-toolbar-section icon="material-symbols:map" label="Map Libre">
        <bim-button icon="mdi:location" label="Locate Model" @click="${ifclocator.showModel}"></bim-button>
      </bim-toolbar-section>
      `;
  });

  return toolbarSection;
};
