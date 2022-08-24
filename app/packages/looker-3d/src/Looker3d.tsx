import * as fop from "@fiftyone/plugins";
import React, {
  useState,
  useRef,
  useEffect,
  Fragment,
  MutableRefObject,
  useCallback,
  Suspense,
} from "react";
import {
  Canvas,
  ThreeEvent,
  useFrame,
  useLoader,
  useThree,
} from "@react-three/fiber";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import styled from "styled-components";
import ColorLensIcon from "@mui/icons-material/ColorLens";
import * as pcState from "./state";
import * as recoil from "recoil";
import * as fos from "@fiftyone/state";
import { ShadeByIntensity, ShadeByZ } from "./shaders";
import _ from "lodash";
import {
  JSONPanel,
  Loading,
  PopoutSectionTitle,
  TabOption,
} from "@fiftyone/components";
import { colorMap } from "@fiftyone/state";

THREE.Object3D.DefaultUp = new THREE.Vector3(0, 0, 1);

const deg2rad = (degrees) => degrees * (Math.PI / 180);

function PointCloudMesh({ minZ, colorBy, points, rotation, onLoad }) {
  const colorMinMaxRef = React.useRef();
  const geo = points.geometry;
  geo.computeBoundingBox();
  React.useEffect(() => {
    onLoad(geo);
    const colorAttribute = geo.getAttribute("color");
    if (colorAttribute) {
      colorMinMaxRef.current =
        computeMinMaxForColorBufferAttribute(colorAttribute);
    } else {
      colorMinMaxRef.current = { min: 0, max: 1 };
    }
  }, [geo, points]);
  const gradients = [
    [0.0, "rgb(165,0,38)"],
    [0.111, "rgb(215,48,39)"],
    [0.222, "rgb(244,109,67)"],
    [0.333, "rgb(253,174,97)"],
    [0.444, "rgb(254,224,144)"],
    [0.555, "rgb(224,243,248)"],
    [0.666, "rgb(171,217,233)"],
    [0.777, "rgb(116,173,209)"],
    [0.888, "rgb(69,117,180)"],
    [1.0, "rgb(49,54,149)"],
  ];

  if (minZ === undefined) {
    minZ = geo.boundingBox.min.z;
  }

  let material;
  switch (colorBy) {
    case "none":
      material = <pointsMaterial color={"white"} size={0.0001} />;
      break;
    case "height":
      material = (
        <ShadeByZ
          gradients={gradients}
          minZ={minZ}
          maxZ={geo.boundingBox.max.z}
        />
      );
      break;
    case "intensity":
      if (colorMinMaxRef.current)
        material = (
          <ShadeByIntensity {...colorMinMaxRef.current} gradients={gradients} />
        );
      break;
  }

  return (
    <primitive key={colorBy} scale={1} object={points} rotation={rotation}>
      {material}
    </primitive>
  );
}

// function Polygon({opacity, filled, closed, points3d, color, selected, onClick}) {
//   const points = points3d.map(p => new THREE.Vector2(p[0], p[1]))
//   const shape = React.useMemo(() => new THREE.Shape(points), [])
//   const geo = React.useMemo(() => new THREE.ShapeGeometry(shape), [])
//   const mat = React.useMemo(() => {
//     const m = new THREE.MeshBasicMaterial()
//     m.side = THREE.DoubleSide
//     return m
//   }, [])
//   return (
//     <mesh>
//       <primitive object={geo} attach="geometry" />
//       <primitive object={mat} attach="material" color="green" />
//     </mesh>
//   )
// }

function Cuboid({
  itemRotation,
  dimensions,
  opacity,
  rotation,
  rotation_y = 0,
  rotation_z = 0,
  location,
  selected,
  onClick,
  color,
}) {
  const [x, y, z] = location;
  const x2 = x;
  const y2 = y - 0.5 * dimensions[1];
  const z2 = z;
  const loc = [x2, y2, z2];
  const itemRotationVec = new THREE.Vector3(...itemRotation);
  const rawLegacyRotation = [0, rotation_y, rotation_z];
  const resolvedRotation = new THREE.Vector3(
    ...(rotation || rawLegacyRotation)
  );
  const actualRotation = resolvedRotation.add(itemRotationVec).toArray();

  // [0, rotation_y + Math.PI / 2, rotation_z]
  const geo = React.useMemo(() => new THREE.BoxGeometry(...dimensions), []);
  return (
    <Fragment>
      <mesh position={loc} rotation={actualRotation}>
        <lineSegments>
          <edgesGeometry args={[geo]} attach="geometry" />
          <lineBasicMaterial
            attach="material"
            lineWidth={8}
            color={selected ? "orange" : color}
          />
        </lineSegments>
      </mesh>
      <mesh onClick={onClick} position={loc} rotation={actualRotation}>
        <boxGeometry args={dimensions} />
        <meshBasicMaterial
          transparent={true}
          opacity={opacity * 0.5}
          color={selected ? "orange" : color}
        />
      </mesh>
    </Fragment>
  );
}

function Line({ rotation, points, color, opacity, onClick }) {
  const geo = React.useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(...p))
    );
    g.rotateX(rotation.x);
    g.rotateY(rotation.y);
    g.rotateZ(rotation.z);
    return g;
  }, []);

  return (
    <line onClick={onClick}>
      <primitive object={geo} attach="geometry" rotation={rotation} />
      <lineBasicMaterial attach="material" color={color} />
    </line>
  );
}

function Polyline({
  opacity,
  filled,
  closed,
  overlayRotation,
  points3d,
  color,
  selected,
  onClick,
}) {
  if (filled) {
    // filled not yet supported
    return null;
  }
  const rotationVec = new THREE.Vector3(...overlayRotation);

  console.log("polyline points", points3d);

  const lines = points3d.map((points) => (
    <Line
      rotation={rotationVec}
      points={points}
      opacity={opacity}
      color={selected ? "orange" : color}
      onClick={onClick}
    />
  ));

  return lines;
}

function CameraSetup({ cameraRef, controlsRef, settings }) {
  const camera = useThree((state) => state.camera);

  React.useLayoutEffect(() => {
    if (settings.defaultCameraPosition) {
      camera.position.set(
        settings.defaultCameraPosition.x,
        settings.defaultCameraPosition.y,
        settings.defaultCameraPosition.z
      );
    } else {
      camera.position.set(0, 0, 20);
    }
    camera.rotation.set(0, 0, 0);
    camera.updateProjectionMatrix();
    cameraRef.current = camera;
  }, [camera]);
  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      autoRotateSpeed={2.5}
      zoomSpeed={0.5}
    />
  );
}

export function getFilepathField(sample, fields) {
  fields = fields || ["filepath"];

  for (const fieldName of fields) {
    const filepath = sample[fieldName];
    if (typeof filepath === "string" && filepath.endsWith(".pcd")) {
      return fieldName;
    }
  }
  return null;
}

export const usePathFilter = (): Partial => {
  const fn = useRef((path: string, value: any) => true);
  const loaded = recoil.useRecoilValueLoadable(fos.pathFilter(true));

  if (loaded.state === "hasValue") {
    fn.current = loaded.contents;
  }

  return fn.current;
};

export function Looker3d(props) {
  return (
    <ErrorBoundary>
      <Looker3dCore {...props} />
    </ErrorBoundary>
  );
}

function Looker3dCore({ sampleOverride: sample }) {
  console.log("rendering....!");
  const settings = fop.usePluginSettings("3d");

  const modal = true;
  const isModal = true;
  const mediaField = recoil.useRecoilValue(fos.selectedMediaField(isModal));
  // @ts-ignore
  const src = fos.getSampleSrc(sample[mediaField]);
  const points = useLoader(PCDLoader, src);
  const selectedLabels = recoil.useRecoilValue(fos.selectedLabels);
  const pathFilter = usePathFilter();
  const labelAlpha = recoil.useRecoilValue(fos.alpha(modal));
  const onSelectLabel = fos.useOnSelectLabel();
  const cameraRef = React.useRef();
  const controlsRef = React.useRef();
  const getColor = recoil.useRecoilValue(fos.colorMap(true));
  const [pointCloudBounds, setPointCloudBounds] = React.useState();

  const overlays = load3dOverlays(sample, selectedLabels)
    .map((l) => {
      return { ...l, color: getColor(l.path.join(".")) };
    })
    .filter((l) => pathFilter(l.path.join("."), l));

  const handleSelect = (label) => {
    onSelectLabel({
      detail: { id: label._id, field: label.path[label.path.length - 1] },
    });
  };

  const colorBy = recoil.useRecoilValue(pcState.colorBy);

  function onChangeView(view) {
    const camera = cameraRef.current as any;
    const controls = controlsRef.current as any;
    if (camera) {
      if (controls) {
        controls.target.set(0, 0, 0);
      }
      switch (view) {
        case "top":
          if (settings.defaultCameraPosition) {
            camera.position.set(
              settings.defaultCameraPosition.x,
              settings.defaultCameraPosition.y,
              settings.defaultCameraPosition.z
            );
          } else {
            const maxZ = pointCloudBounds ? pointCloudBounds.max.z : null;
            if (maxZ !== null) {
              camera.position.set(0, 0, 20 * maxZ);
            }
          }
          break;
        case "pov":
          camera.position.set(0, -10, 1);
          break;
      }
      controls.update();
      camera.updateProjectionMatrix();
    }
  }

  const pcRotationSetting = _.get(settings, "pointCloud.rotation", [0, 0, 0]);
  const pcRotation = toEulerFromDegreesArray(pcRotationSetting);
  const minZ = _.get(settings, "pointCloud.minZ", null);
  const overlayRotation = toEulerFromDegreesArray(
    _.get(settings, "overlay.rotation", [0, 0, 0])
  );
  const itemRotation = toEulerFromDegreesArray(
    _.get(settings, "overlay.itemRotation", [0, 0, 0])
  );
  const [hovering, setHovering] = useState(false);
  const setAction = recoil.useSetRecoilState(pcState.currentAction);

  const timeout: MutableRefObject<NodeJS.Timeout | null> =
    useRef<NodeJS.Timeout>(null);
  const clear = useCallback(() => {
    if (hoveringRef.current) return;
    timeout.current && clearTimeout(timeout.current);
    setHovering(false);
    setAction(null);
  }, []);
  const update = useCallback(() => {
    !hovering && setHovering(true);
    timeout.current && clearTimeout(timeout.current);
    timeout.current = setTimeout(clear, 3000);

    return () => {
      timeout.current && clearTimeout(timeout.current);
    };
  }, [clear, hovering]);
  const hoveringRef = useRef(false);

  return (
    <Container onMouseEnter={update} onMouseMove={update} onMouseLeave={clear}>
      <Canvas onClick={() => clear()}>
        <CameraSetup
          controlsRef={controlsRef}
          cameraRef={cameraRef}
          settings={settings}
        />
        <mesh rotation={overlayRotation}>
          {overlays
            .filter((o) => o._cls === "Detection")
            .map((label, key) => (
              <Cuboid
                itemRotation={itemRotation}
                key={key}
                opacity={labelAlpha}
                {...label}
                onClick={() => handleSelect(label)}
              />
            ))}
        </mesh>
        {overlays
          .filter((o) => o._cls === "Polyline" && o.points3d)
          .map((label, key) => (
            <Polyline
              overlayRotation={overlayRotation}
              key={key}
              opacity={labelAlpha}
              {...label}
              onClick={() => handleSelect(label)}
            />
          ))}
        <PointCloudMesh
          minZ={minZ}
          colorBy={colorBy}
          points={points}
          rotation={pcRotation}
          onLoad={(geo) => {
            setPointCloudBounds(geo.boundingBox);
          }}
        />
        <axesHelper />
      </Canvas>
      {(hoveringRef.current || hovering) && (
        <ActionBarContainer
          onMouseEnter={() => (hoveringRef.current = true)}
          onMouseLeave={() => (hoveringRef.current = false)}
        >
          <ActionsBar>
            <ChooseColorSpace />
            <SetViewButton
              onChangeView={onChangeView}
              view={"top"}
              label={"T"}
              hint="Top View"
            />
            <SetViewButton
              onChangeView={onChangeView}
              view={"pov"}
              label={"E"}
              hint="Ego View"
            />
            <ViewJSON />
          </ActionsBar>
        </ActionBarContainer>
      )}
    </Container>
  );
}

function toEulerFromDegreesArray(arr) {
  return arr.map(deg2rad);
}

const Container = styled.div`
  height: 100%;
  width: 100%;
  position: relative;
`;

const ActionBarContainer = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  opacity: 1;
  z-index: 20;
  justify-items: center;
  align-items: center;

  color: #eee;

  -webkit-transition: opacity 0.5s;
  -moz-transition: opacity 0.5s;
  -o-transition: opacity 0.5s;
  -ms-transition: opacity 0.5s;
  transition: opacity 0.5s;
  width: 100%;

  opacity: 0.9;
  height: 37px;
  background-color: hsl(210, 11%, 11%);
  border: 1px solid #191c1f;
  box-shadow: 0 8px 15px 0 rgba(0, 0, 0, 0.43);
  padding: 0 1rem;
`;

const ActionsBar = styled.div`
  position: relative;
  display: flex;
  justify-content: end;
  row-gap: 0.5rem;
  column-gap: 0.75rem;
  align-items: center;
  height: 2.3rem;
`;

const ActionPopOverDiv = styled.div`
  width: 16rem;
  position: absolute;
  bottom: 2.5rem;
  background-color: hsl(210, 11%, 11%);
  overflow: hidden;
`;

const ActionPopOverInner = styled.div`
  padding: 0 0.25rem;
`;

function ActionPopOver({ children }) {
  return (
    <ActionPopOverDiv>
      <ActionPopOverInner>{children}</ActionPopOverInner>
    </ActionPopOverDiv>
  );
}

const ActionItem = styled.div`
  display: flex;
  align-content: center;
  text-align: center;
  cursor: pointer;
`;

const ViewButton = styled.div`
  line-height: 1rem;
  padding: 0.2rem 0.4rem;
  background-color: #fff;
  color: #000;
  border-radius: 1rem;
  border: none;
  font-weight: bold;
  display: flex;
  justify-content: space-between;
  opacity: 1;
`;

function SetViewButton({ onChangeView, view, label, hint }) {
  return (
    <ActionItem onClick={() => onChangeView(view)}>
      <ViewButton title={hint}>{label}</ViewButton>
    </ActionItem>
  );
}

function ChooseColorSpace() {
  const [currentAction, setAction] = recoil.useRecoilState(
    pcState.currentAction
  );

  return (
    <Fragment>
      <ActionItem>
        <ColorLensIcon
          onClick={(e) => {
            const targetAction = "colorBy";
            const nextAction =
              currentAction === targetAction ? null : targetAction;
            setAction(nextAction);
            e.stopPropagation();
            e.preventDefault();
            return false;
          }}
        />
      </ActionItem>
      {currentAction === "colorBy" && <ColorSpaceChoices />}
    </Fragment>
  );
}

const ColorSpaceChoices = ({ modal }) => {
  const [current, setCurrent] = recoil.useRecoilState(pcState.colorBy);

  return (
    <ActionPopOver>
      <PopoutSectionTitle>Color by</PopoutSectionTitle>

      <TabOption
        active={current}
        options={pcState.COLOR_BY_CHOICES.map(({ label, value }) => {
          return {
            text: value,
            title: `Color by ${label}`,
            onClick: () => current !== value && setCurrent(value),
          };
        })}
      />
    </ActionPopOver>
  );
};

function Choice({ label, value }) {
  const [current, setCurrent] = recoil.useRecoilState(pcState.colorBy);
  const selected = value === current;
  return (
    <div onClick={() => setCurrent(value)}>
      <input type="radio" checked={selected} />
      {label}
    </div>
  );
}

function ViewJSON() {
  const jsonPanel = fos.useJSONPanel();
  const [currentAction, setAction] = recoil.useRecoilState(
    pcState.currentAction
  );

  return (
    <Fragment>
      <ActionItem>
        <ColorLensIcon
          onClick={(e) => {
            const targetAction = "json";
            const nextAction =
              currentAction === targetAction ? null : targetAction;
            setAction(nextAction);
            e.stopPropagation();
            e.preventDefault();
            return false;
          }}
        />
      </ActionItem>
      {jsonPanel.isOpen && (
        <PanelOverlayPortal>
          <h1>Hello</h1>
          {/* <JSONPanel json={'{"foo":"bar"}'} /> */}
        </PanelOverlayPortal>
      )}
    </Fragment>
  );
}

function load3dOverlays(sample, selectedLabels, currentPath = []) {
  let overlays = [];
  const labels = Array.isArray(sample) ? sample : Object.values(sample);
  const labelKeys = Array.isArray(sample) ? null : Object.keys(sample);
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const labelKey = labelKeys ? labelKeys[i] : "";
    if (!label) {
      continue;
    }

    // Note: this logic is not quite right
    // this is hardcoded to match the kitti dataset
    // it should change to be dataset agnostic!
    if (RENDERABLE.includes(label._cls)) {
      overlays.push({
        ...label,
        path: [...currentPath, labelKey].filter((k) => !!k),
        selected: label._id in selectedLabels,
      });
    } else if (RENDERABLE_LIST.includes(label._cls)) {
      overlays = [
        ...overlays,
        ...load3dOverlays(
          label[label._cls.toLowerCase()],
          selectedLabels,
          labelKey ? [...currentPath, labelKey] : [...currentPath]
        ),
      ];
    }
  }

  return overlays;
}

const RENDERABLE = ["Detection", "Polyline"];
const RENDERABLE_LIST = ["Detections", "Polylines"];

function toFlatVectorArray(listOfLists) {
  let vectors = [];
  for (const list of listOfLists) {
    const isVector = typeof list[0] === "number";
    if (isVector) {
      vectors.push(list);
    } else if (Array.isArray(list)) {
      vectors = [...vectors, ...toFlatVectorArray(list)];
    }
  }
  return vectors;
}

function computeMinMaxForColorBufferAttribute(colorAttribute) {
  let minX = 0;
  let maxX = 0;
  for (let i = 0; i < colorAttribute.count; i++) {
    const x = colorAttribute.getX(i);
    minX = Math.min(x, minX);
    maxX = Math.max(x, maxX);
  }

  return { min: minX, max: maxX };
}

class ErrorBoundary extends React.Component<
  { set: React.Dispatch<any> },
  { error: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError = (error) => ({ hasError: true, error });
  componentDidCatch(error: any) {}
  render() {
    if (this.state.hasError) {
      const { message, stack } = this.state.error;

      return <Loading>{this.state.error}</Loading>;
    }

    return this.props.children;
  }
}

class PanelOverlayPortal extends React.Component {
  constructor(props) {
    super(props);
    this.el = document.getElementById("lookerPanelOverlayContainer");
  }
  render() {
    return ReactDOM.createPortal(this.props.children, this.el);
  }
}
