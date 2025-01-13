import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import maplibregl, { LngLatLike, CustomLayerInterface } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import projectInformation from "./components/Panels/ProjectInformation";
import elementData from "./components/Panels/Selection";
import settings from "./components/Panels/Settings";
import load from "./components/Toolbars/Sections/Import";
import help from "./components/Panels/Help";
import camera from "./components/Toolbars/Sections/Camera";
import measurement from "./components/Toolbars/Sections/Measurement";
import selection from "./components/Toolbars/Sections/Selection";
import { AppManager, IFCLocator, IFCLocatorUI } from "./bim-components";

BUI.Manager.init();

const components = new OBC.Components();
const worlds = components.get(OBC.Worlds);

const world = worlds.create<
  OBC.SimpleScene,
  OBC.OrthoPerspectiveCamera,
  OBF.PostproductionRenderer
>();
world.name = "Main";

world.scene = new OBC.SimpleScene(components);
world.scene.setup();
world.scene.three.background = null;

const viewport = BUI.Component.create<BUI.Viewport>(() => {
  return BUI.html`
    <bim-viewport>
      <bim-grid floating></bim-grid>
    </bim-viewport>
  `;
});

world.renderer = new OBF.PostproductionRenderer(components, viewport);
const { postproduction } = world.renderer;

world.camera = new OBC.OrthoPerspectiveCamera(components);

const worldGrid = components.get(OBC.Grids).create(world);
worldGrid.material.uniforms.uColor.value = new THREE.Color(0x424242);
worldGrid.material.uniforms.uSize1.value = 2;
worldGrid.material.uniforms.uSize2.value = 8;

const resizeWorld = () => {
  world.renderer?.resize();
  world.camera.updateAspect();
};

viewport.addEventListener("resize", resizeWorld);

components.init();

postproduction.enabled = true;
postproduction.customEffects.excludedMeshes.push(worldGrid.three);
postproduction.setPasses({ custom: true, ao: true, gamma: true });
postproduction.customEffects.lineColor = 0x17191c;

const appManager = components.get(AppManager);
const viewportGrid = viewport.querySelector<BUI.Grid>("bim-grid[floating]")!;
appManager.grids.set("viewport", viewportGrid);

const fragments = components.get(OBC.FragmentsManager);
const indexer = components.get(OBC.IfcRelationsIndexer);
const classifier = components.get(OBC.Classifier);
classifier.list.CustomSelections = {};

const ifcLoader = components.get(OBC.IfcLoader);
await ifcLoader.setup();

const tilesLoader = components.get(OBF.IfcStreamer);
tilesLoader.world = world;
tilesLoader.culler.threshold = 10;
tilesLoader.culler.maxHiddenTime = 1000;
tilesLoader.culler.maxLostTime = 40000;

const highlighter = components.get(OBF.Highlighter);
highlighter.setup({ world });
highlighter.zoomToSelection = true;

const culler = components.get(OBC.Cullers).create(world);
culler.threshold = 5;

world.camera.controls.restThreshold = 0.25;
world.camera.controls.addEventListener("rest", () => {
  culler.needsUpdate = true;
  tilesLoader.cancel = true;
  tilesLoader.culler.needsUpdate = true;
});

fragments.onFragmentsLoaded.add(async (model) => {
  if (model.hasProperties) {
    await indexer.process(model);
    classifier.byEntity(model);
  }

  if (!model.isStreamed) {
    for (const fragment of model.items) {
      world.meshes.add(fragment.mesh);
      culler.add(fragment.mesh);
    }
  }

  world.scene.three.add(model);

  if (!model.isStreamed) {
    setTimeout(async () => {
      world.camera.fit(world.meshes, 0.8);
    }, 50);
  }
});

fragments.onFragmentsDisposed.add(({ fragmentIDs }) => {
  for (const fragmentID of fragmentIDs) {
    const mesh = [...world.meshes].find((mesh) => mesh.uuid === fragmentID);
    if (mesh) {
      world.meshes.delete(mesh);
    }
  }
});

const ifclocator = components.get(IFCLocator);
const projectInformationPanel = projectInformation(components);
const elementDataPanel = elementData(components);

const toolbar = BUI.Component.create(() => {
  return BUI.html`
    <bim-tabs floating style="justify-self: center; border-radius: 0.5rem;">
      <bim-tab label="Import">
        <bim-toolbar>
          ${load(components)}
        </bim-toolbar>
      </bim-tab>
      <bim-tab label="Selection">
        <bim-toolbar>
          ${camera(world)}
          ${selection(components, world)}
        </bim-toolbar>
      </bim-tab>
      <bim-tab label="Measurement">
        <bim-toolbar>
            ${measurement(world, components)}
        </bim-toolbar>
      </bim-tab>
      <bim-tab label="Maps">
        <bim-toolbar>
          ${IFCLocatorUI(components)} 
        </bim-toolbar> 
      </bim-tab> 
    </bim-tabs>
  `;
});

const leftPanel = BUI.Component.create(() => {
  return BUI.html`
    <bim-tabs switchers-full>
      <bim-tab name="project" label="Project" icon="ph:building-fill">
        ${projectInformationPanel}
      </bim-tab>
      <bim-tab name="settings" label="Settings" icon="solar:settings-bold">
        ${settings(components)}
      </bim-tab>
      <bim-tab name="help" label="Help" icon="material-symbols:help">
        ${help}
      </bim-tab>
    </bim-tabs> 
  `;
});

// Function to alternate between the templates.
const toggleMap = () => {
  if (app.layout === "map") {
    worldGrid.visible = true;
    app.layout = "main";
  } 
};

const modelButton = BUI.Component.create(() => {
  return BUI.html`
    <bim-button label='View Model' id="modelButton" icon="simple-icons:homeadvisor" @click="${toggleMap}">
    </bim-button>
  `;
});


const map = document.getElementById("map") as HTMLDivElement;
const app = document.getElementById("app") as BUI.Grid;

app.layouts = {
  main: {
    template: `
      "leftPanel viewport" 1fr
      /26rem 1fr
    `,
    elements: {
      leftPanel,
      viewport,
    },
  },
  map: {
    template: `
    "modelButton" auto
    "map" 1fr
    `,
    elements: {
      modelButton,
      map,
    },
  },
};

app.layout = "main";

viewportGrid.layouts = {
  main: {
    template: `
      "empty" 1fr
      "toolbar" auto
      /1fr
    `,
    elements: { toolbar },
  },
  second: {
    template: `
      "empty elementDataPanel" 1fr
      "toolbar elementDataPanel" auto
      /1fr 24rem
    `,
    elements: {
      toolbar,
      elementDataPanel,
    },
  },
};

viewportGrid.layout = "main";

ifclocator.onMapRequested.add((data) => {
  worldGrid.visible = false;
  app.layout = "map";

  const maplibre = new maplibregl.Map({
    container: "map", // container id
    style:
      "https://api.maptiler.com/maps/basic-v2/style.json?key=AaPiLXuttlRqx1xdPIBi",
    center: data.coords as LngLatLike,
    zoom: 18,
    pitch: 45,
    bearing: -17.6,
  });

  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
  });

  const layerRenderer = new THREE.WebGLRenderer({
    canvas: maplibre.getCanvas(),
    context: maplibre.getCanvas().getContext("webgl") as WebGLRenderingContext,
    antialias: true,
    alpha: true,
  });

  function loadModel(coords: LngLatLike, rotation: number) {
    const modelRotate = [Math.PI / 2, Math.PI / rotation, 0];

    const modelAsMercatorCoordinate = maplibregl.MercatorCoordinate.fromLngLat(
      coords,
      data.altitude,
    );

    if (maplibre.getLayer("3dmodel")) {
      maplibre.removeLayer("3dmodel");
    }

    // transformation parameters to position, rotate and scale the 3D model onto the map
    const modelTransform = {
      translateX: modelAsMercatorCoordinate.x,
      translateY: modelAsMercatorCoordinate.y,
      translateZ: modelAsMercatorCoordinate.z,
      rotateX: modelRotate[0],
      rotateY: modelRotate[1],
      rotateZ: modelRotate[2],
      /* Since our 3D model is in real world meters, a scale transform needs to be
       * applied since the CustomLayerInterface expects units in MercatorCoordinates.
       */
      scale: modelAsMercatorCoordinate.meterInMercatorCoordinateUnits(),
    };

    const layerCamera = new THREE.Camera();

    const customLayer: CustomLayerInterface = {
      id: "3dmodel",
      type: "custom",
      renderingMode: "3d",
      async onAdd() {
        layerRenderer.autoClear = false;
      },
      render(_, matrix) {
        const rotationX = new THREE.Matrix4().makeRotationAxis(
          new THREE.Vector3(1, 0, 0),
          modelTransform.rotateX,
        );
        const rotationY = new THREE.Matrix4().makeRotationAxis(
          new THREE.Vector3(0, 1, 0),
          modelTransform.rotateY,
        );
        const rotationZ = new THREE.Matrix4().makeRotationAxis(
          new THREE.Vector3(0, 0, 1),
          modelTransform.rotateZ,
        );

        const m = new THREE.Matrix4().fromArray(matrix);
        const l = new THREE.Matrix4()
          .makeTranslation(
            modelTransform.translateX,
            modelTransform.translateY,
            modelTransform.translateZ,
          )
          .scale(
            new THREE.Vector3(
              modelTransform.scale,
              -modelTransform.scale,
              modelTransform.scale,
            ),
          )
          .multiply(rotationX)
          .multiply(rotationY)
          .multiply(rotationZ);

        layerCamera.projectionMatrix = m.multiply(l);
        layerRenderer.resetState();
        layerRenderer.render(world.scene.three, layerCamera);
        maplibre.triggerRepaint();
      },
    };

    maplibre.on("style.load", () => {
      maplibre.addLayer(customLayer);
    });

    const isLoaded = maplibre.isStyleLoaded();
    if (isLoaded) {
      maplibre.addLayer(customLayer);
    }
  }

  async function setMarker(coords: number[]) {
    const loadedLayer = maplibre.getLayer("places");

    if (loadedLayer) {
      maplibre.removeLayer("places");
      maplibre.removeSource("places");
      maplibre.removeImage("custom-marker");
    }

    const image = await maplibre.loadImage(
      "https://maplibre.org/maplibre-gl-js/docs/assets/custom_marker.png",
    );

    maplibre.addImage("custom-marker", image.data);

    maplibre.addSource("places", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {
          description: "<strong>Click to modify Model's coordinates</strong>",
        },
        geometry: {
          type: "Point",
          coordinates: coords as number[],
        },
      },
    });

    maplibre.addLayer({
      id: "places",
      type: "symbol",
      source: "places",
      layout: {
        "icon-image": "custom-marker",
        "icon-overlap": "always",
      },
    });
  }

  maplibre.on("load", async () => {
    setMarker(data.coords);

    let holdPopup = false;

    maplibre.on("mouseenter", "places", (e) => {
      maplibre.getCanvas().style.cursor = "pointer";
      if (!(e.features && "properties" in e.features[0])) return;
      const properties = e.features[0].properties as { description: string };
      const description = properties.description;

      if (!holdPopup) {
        popup
          .setLngLat(e.lngLat)
          .setHTML(description as string)
          .addTo(maplibre);
      }
    });
    maplibre.on("click", "places", (e) => {
      maplibre.getCanvas().style.cursor = "crosshair";
      const description =
        `<strong>Double click on the map to set new coordinates</strong><p>Long: ${e.lngLat.lng}</p><p>Lat: ${e.lngLat.lat}</p>`;
      popup.setLngLat(e.lngLat).setHTML(description).addTo(maplibre);

      holdPopup = true;

      maplibre.doubleClickZoom.disable();
    });

    maplibre.on("mouseleave", "places", () => {
      if (!holdPopup) {
        maplibre.getCanvas().style.cursor = "";
        popup.remove();
      }
    });

    maplibre.on("dblclick", (e) => {
      if (holdPopup) {
        // Set a prompt to allow the input of a rotation
        let inputRotation = window.prompt("Enter a number to set model's rotation: ");
        
        // Handle the case where inputRotation might be null
        if (!inputRotation) {
            inputRotation = "1"; // Default to "1" as a string
        }
        const newRotation = parseFloat(inputRotation);
        loadModel(e.lngLat, newRotation);
        setMarker([e.lngLat.lng, e.lngLat.lat]);
        popup.remove();

        maplibre.getCanvas().style.cursor = "";
        maplibre.setCenter(e.lngLat);
        maplibre.setZoom(18);
        maplibre.setPitch(45);
        maplibre.setBearing(-17.5);

        const coords = [e.lngLat.lat, e.lngLat.lng];
        const updateLocation = components.get(IFCLocator);
        updateLocation.saveCoordinates(coords)

        holdPopup = false;

        setTimeout(() => {
          maplibre.doubleClickZoom.enable();
        }, 100);
      }
    });
  });

  loadModel(data.coords as LngLatLike, 1);
});
