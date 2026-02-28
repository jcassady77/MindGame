import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, Map as MapIcon, Wind, Compass, Landmark, History, Move, Users, Sun, Sword, Snowflake, Mountain } from 'lucide-react';

// --- Constants & Types ---
const CITY_SIZE = 250;
const BUILDING_COUNT = 300;
const TREE_COUNT = 150;
const NPC_COUNT = 40;

// --- Components ---

const Overlay = ({ onToggleInfo }: { onToggleInfo: () => void }) => {
  return (
    <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-8 z-10">
      <header className="flex justify-between items-start">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-1"
        >
          <h1 className="font-display text-4xl tracking-widest text-slate-100 shadow-lg">SKYRIM</h1>
          <p className="font-serif italic text-sm text-slate-300/80">Tundra Echoes • Nordic Realm</p>
        </motion.div>
        
        <div className="flex gap-4 pointer-events-auto">
          <button 
            onClick={onToggleInfo}
            className="p-3 rounded-full glass-panel hover:bg-slate-700/40 transition-colors text-slate-100/90 border-slate-500/30"
          >
            <Info size={20} />
          </button>
        </div>
      </header>

      <div className="flex flex-col items-center justify-center flex-1">
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1 }}
          className="glass-panel px-6 py-3 rounded-full flex items-center gap-4 text-slate-100/80 text-xs tracking-[0.2em] uppercase font-sans border-slate-500/30"
        >
          <div className="flex gap-1">
            <span className="px-2 py-1 border border-slate-400/40 rounded bg-slate-400/20">W</span>
            <span className="px-2 py-1 border border-slate-400/40 rounded bg-slate-400/20">A</span>
            <span className="px-2 py-1 border border-slate-400/40 rounded bg-slate-400/20">S</span>
            <span className="px-2 py-1 border border-slate-400/40 rounded bg-slate-400/20">D</span>
            <span className="px-2 py-1 border border-slate-400/40 rounded bg-slate-400/20 ml-2">↑</span>
            <span className="px-2 py-1 border border-slate-400/40 rounded bg-slate-400/20">←</span>
            <span className="px-2 py-1 border border-slate-400/40 rounded bg-slate-400/20">↓</span>
            <span className="px-2 py-1 border border-slate-400/40 rounded bg-slate-400/20">→</span>
          </div>
          <span>to Roam the Tundra</span>
        </motion.div>
      </div>

      <footer className="flex justify-between items-end">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-panel p-4 rounded-lg space-y-2 max-w-xs border-slate-500/30"
        >
          <div className="flex items-center gap-2 text-slate-300 text-xs uppercase tracking-widest font-sans font-semibold">
            <Snowflake size={14} />
            <span>Atmosphere</span>
          </div>
          <p className="text-xs text-slate-100/80 leading-relaxed">
            The cold winds of the north howl through the ancient stone halls. A land of dragons, heroes, and eternal frost.
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-right space-y-1"
        >
          <div className="text-4xl font-display text-slate-100/30 select-none tracking-tighter">4E 201</div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-slate-300/50">Fourth Era</div>
        </motion.div>
      </footer>
    </div>
  );
};

const InfoModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="glass-panel max-w-2xl w-full p-8 rounded-2xl overflow-hidden relative border-slate-500/40"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
            
            <div className="flex items-start gap-6">
              <div className="p-4 bg-slate-700/30 rounded-xl text-slate-200">
                <Mountain size={32} />
              </div>
              <div className="space-y-4">
                <h2 className="font-display text-3xl text-slate-50">The Realm of Skyrim</h2>
                <div className="space-y-4 text-slate-100/90 font-serif leading-relaxed">
                  <p>
                    Skyrim is the northernmost province of Tamriel, a land of rugged mountains, icy tundras, and ancient Nordic ruins. It is the home of the Nords, a hardy people known for their resilience and martial prowess.
                  </p>
                  <p>
                    From the bustling markets of Whiterun to the frozen docks of Windhelm, the province is steeped in history and myth. Ancient word walls and dragon mounds dot the landscape, remnants of a time when dragons ruled the skies.
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div className="p-4 border border-slate-500/30 rounded-lg bg-slate-500/10">
                    <div className="flex items-center gap-2 text-slate-300 text-xs uppercase tracking-wider mb-1">
                      <Sword size={14} />
                      <span>Combat</span>
                    </div>
                    <p className="text-xs text-slate-100/60">Steel blades and iron shields of the Dragonborn.</p>
                  </div>
                  <div className="p-4 border border-slate-500/30 rounded-lg bg-slate-500/10">
                    <div className="flex items-center gap-2 text-slate-300 text-xs uppercase tracking-wider mb-1">
                      <Wind size={14} />
                      <span>The Voice</span>
                    </div>
                    <p className="text-xs text-slate-100/60">Shouts that echo through the Throat of the World.</p>
                  </div>
                </div>

                <button 
                  onClick={onClose}
                  className="mt-6 w-full py-3 bg-slate-700/40 hover:bg-slate-700/60 border border-slate-400/50 text-slate-50 font-display tracking-widest transition-all rounded-lg shadow-lg"
                >
                  RETURN TO THE TUNDRA
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showInfo, setShowInfo] = useState(false);
  const keys = useRef<{ [key: string]: boolean }>({});

  useEffect(() => {
    if (!containerRef.current) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    const skyColor = 0xaabbcc; // Cold blue-gray sky
    scene.background = new THREE.Color(skyColor);
    scene.fog = new THREE.FogExp2(skyColor, 0.006);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 40, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xccddee, 1.2);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 500;
    sunLight.shadow.camera.left = -150;
    sunLight.shadow.camera.right = 150;
    sunLight.shadow.camera.top = 150;
    sunLight.shadow.camera.bottom = -150;
    scene.add(sunLight);

    // --- Ground ---
    const groundGeo = new THREE.PlaneGeometry(1000, 1000);
    const groundMat = new THREE.MeshStandardMaterial({ 
      color: 0xeeeeee, // Snow
      roughness: 0.9,
      metalness: 0.0
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // --- Dragonborn Character ---
    const createDragonborn = () => {
      const group = new THREE.Group();
      const ironMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8, roughness: 0.3 });
      const furMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 1.0 });
      const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdbac });

      // Body
      const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 0.6), furMat);
      body.position.y = 1.25;
      body.castShadow = true;
      group.add(body);

      // Iron Chestplate
      const chest = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.7), ironMat);
      chest.position.y = 1.5;
      group.add(chest);

      // Head / Horned Helmet
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), ironMat);
      head.position.y = 2.3;
      head.castShadow = true;
      group.add(head);

      // Horns
      const hornGeo = new THREE.ConeGeometry(0.15, 0.6, 8);
      const leftHorn = new THREE.Mesh(hornGeo, ironMat);
      leftHorn.position.set(-0.4, 2.6, 0);
      leftHorn.rotation.z = Math.PI / 4;
      group.add(leftHorn);

      const rightHorn = new THREE.Mesh(hornGeo, ironMat);
      rightHorn.position.set(0.4, 2.6, 0);
      rightHorn.rotation.z = -Math.PI / 4;
      group.add(rightHorn);

      // Arms
      const armGeo = new THREE.BoxGeometry(0.3, 1, 0.3);
      const leftArm = new THREE.Mesh(armGeo, furMat);
      leftArm.position.set(-0.7, 1.5, 0);
      leftArm.castShadow = true;
      group.add(leftArm);

      const rightArm = new THREE.Mesh(armGeo, furMat);
      rightArm.position.set(0.7, 1.5, 0);
      rightArm.castShadow = true;
      group.add(rightArm);

      // Legs
      const legGeo = new THREE.BoxGeometry(0.4, 1, 0.4);
      const leftLeg = new THREE.Mesh(legGeo, ironMat);
      leftLeg.position.set(-0.3, 0.5, 0);
      leftLeg.castShadow = true;
      group.add(leftLeg);

      const rightLeg = new THREE.Mesh(legGeo, ironMat);
      rightLeg.position.set(0.3, 0.5, 0);
      rightLeg.castShadow = true;
      group.add(rightLeg);

      // Shield
      const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.1, 16), ironMat);
      shield.rotation.x = Math.PI / 2;
      shield.position.set(-1.0, 1.5, 0.2);
      group.add(shield);

      // Sword
      const swordGroup = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.05), new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9 }));
      blade.position.y = 0.75;
      swordGroup.add(blade);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), furMat);
      swordGroup.add(handle);
      swordGroup.position.set(1.0, 1.2, 0.3);
      swordGroup.rotation.x = -Math.PI / 4;
      group.add(swordGroup);

      return group;
    };

    const warrior = createDragonborn();
    warrior.position.set(0, 0, 0);
    scene.add(warrior);

    // --- NPCs ---
    const npcs: THREE.Group[] = [];
    const npcTargets: THREE.Vector3[] = [];
    const createNPC = () => {
      const group = new THREE.Group();
      const colors = [0x4a3728, 0x2c3e50, 0x34495e, 0x7f8c8d];
      const mat = new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random() * colors.length)] });
      
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.5), mat);
      body.position.y = 0.7;
      body.castShadow = true;
      group.add(body);
      
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffdbac }));
      head.position.y = 1.6;
      head.castShadow = true;
      group.add(head);

      return group;
    };

    for (let i = 0; i < NPC_COUNT; i++) {
      const npc = createNPC();
      const x = (Math.random() - 0.5) * CITY_SIZE;
      const z = (Math.random() - 0.5) * CITY_SIZE;
      npc.position.set(x, 0, z);
      scene.add(npc);
      npcs.push(npc);
      npcTargets.push(new THREE.Vector3((Math.random() - 0.5) * CITY_SIZE, 0, (Math.random() - 0.5) * CITY_SIZE));
    }

    // --- Pine Trees ---
    const createTree = (x: number, z: number) => {
      const group = new THREE.Group();
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f });
      const leavesMat = new THREE.MeshStandardMaterial({ color: 0x1a2e1a });

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 4, 8), trunkMat);
      trunk.position.y = 2;
      trunk.castShadow = true;
      group.add(trunk);

      for (let i = 0; i < 3; i++) {
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.5 - i * 0.5, 4, 8), leavesMat);
        leaves.position.y = 4 + i * 2.5;
        leaves.castShadow = true;
        group.add(leaves);
      }

      group.position.set(x, 0, z);
      scene.add(group);
    };

    for (let i = 0; i < TREE_COUNT; i++) {
      const x = (Math.random() - 0.5) * CITY_SIZE * 1.5;
      const z = (Math.random() - 0.5) * CITY_SIZE * 1.5;
      if (Math.sqrt(x*x + z*z) < 40) continue;
      createTree(x, z);
    }

    // --- Nordic City Generation ---
    const buildingGroup = new THREE.Group();
    scene.add(buildingGroup);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4b3621, roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x111111 }); // Slate/Dark Thatch

    const createNordicHouse = (x: number, z: number) => {
      const h = 8 + Math.random() * 12;
      const w = 6 + Math.random() * 4;
      const d = 6 + Math.random() * 4;
      
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat);
      body.position.set(x, h / 2, z);
      body.castShadow = true;
      body.receiveShadow = true;
      
      // Wooden beams
      const beamGeo = new THREE.BoxGeometry(w + 0.2, 0.4, 0.4);
      for (let i = 0; i < 4; i++) {
        const beam = new THREE.Mesh(beamGeo, woodMat);
        beam.position.set(x, (h / 4) * (i + 1), z + d/2);
        buildingGroup.add(beam);
      }

      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.9, 6, 4), roofMat);
      roof.position.set(x, h + 3, z);
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      
      buildingGroup.add(body, roof);
    };

    const createNordicTower = (x: number, z: number) => {
      const h = 25 + Math.random() * 15;
      const w = 6;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), stoneMat);
      tower.position.set(x, h / 2, z);
      tower.castShadow = true;
      tower.receiveShadow = true;
      
      const top = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 2, w + 1), stoneMat);
      top.position.set(x, h + 1, z);
      
      buildingGroup.add(tower, top);
    };

    for (let i = 0; i < BUILDING_COUNT; i++) {
      const x = (Math.random() - 0.5) * CITY_SIZE;
      const z = (Math.random() - 0.5) * CITY_SIZE;
      if (Math.sqrt(x*x + z*z) < 30) continue;
      if (Math.random() > 0.9) createNordicTower(x, z);
      else createNordicHouse(x, z);
    }

    // --- Input Handling ---
    const onKeyDown = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = true; };
    const onKeyUp = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // --- Animation ---
    const moveSpeed = 0.5;
    const rotateSpeed = 0.05;
    const cameraOffset = new THREE.Vector3(0, 12, 25);

    const animate = () => {
      requestAnimationFrame(animate);

      // Movement
      if (keys.current['s'] || keys.current['arrowdown']) warrior.translateZ(moveSpeed);
      if (keys.current['w'] || keys.current['arrowup']) warrior.translateZ(-moveSpeed);
      if (keys.current['a'] || keys.current['arrowleft']) warrior.rotation.y += rotateSpeed;
      if (keys.current['d'] || keys.current['arrowright']) warrior.rotation.y -= rotateSpeed;

      // NPC Movement
      npcs.forEach((npc, i) => {
        const target = npcTargets[i];
        const dir = target.clone().sub(npc.position).normalize();
        npc.position.add(dir.multiplyScalar(0.08));
        npc.lookAt(target);
        if (npc.position.distanceTo(target) < 1) {
          npcTargets[i] = new THREE.Vector3((Math.random() - 0.5) * CITY_SIZE, 0, (Math.random() - 0.5) * CITY_SIZE);
        }
      });

      // Camera Follow
      const relativeCameraOffset = cameraOffset.clone().applyMatrix4(warrior.matrixWorld);
      camera.position.lerp(relativeCameraOffset, 0.08);
      camera.lookAt(warrior.position.x, warrior.position.y + 3, warrior.position.z);

      renderer.render(scene, camera);
    };

    animate();

    // --- Resize Handler ---
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      renderer.dispose();
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-200">
      <div ref={containerRef} className="absolute inset-0" />
      
      <Overlay onToggleInfo={() => setShowInfo(true)} />
      
      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} />

      {/* Cold Vignette effect */}
      <div className="fixed inset-0 pointer-events-none shadow-[inset_0_0_200px_rgba(30,50,80,0.4)]" />
      
      {/* Snow particles simulation (CSS) */}
      <div className="fixed inset-0 pointer-events-none opacity-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.8)_1px,_transparent_1px)] bg-[length:30px_30px] animate-[pulse_5s_infinite]" />
      </div>
    </div>
  );
}
