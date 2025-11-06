// Copyright (c) 2022 8th Wall, Inc.
//
// app.js is the main entry point for your 8th Wall web app. Code here will execute after head.html
// is loaded, and before body.html is loaded.

// ========================================
// COMPOSANT: Place On Detected Surface (utilise le hit testing 8th Wall)
// ========================================
AFRAME.registerComponent('place-on-surface', {
  schema: {
    enabled: {default: true},
    distance: {default: 1.5}, // Distance devant la caméra
    autoPlace: {default: true} // Place automatiquement au démarrage
  },

  init: function() {
    this.placed = false;
    this.camera = null;

    // Attend que la scène soit prête
    this.el.sceneEl.addEventListener('realityready', () => {
      this.camera = document.querySelector('#camera');
      console.log('Reality ready, camera found:', !!this.camera);

      if (this.data.autoPlace) {
        // Attend un peu que le tracking se stabilise
        setTimeout(() => {
          this.placeOnSurface();
        }, 500);
      }
    });
  },

  placeOnSurface: function() {
    if (!this.data.enabled || this.placed || !this.camera) return;

    const camera = this.camera.object3D;

    // Position devant la caméra (direction forward)
    const cameraPos = camera.position.clone();
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(camera.quaternion);

    // Calcule le point devant la caméra
    const targetPos = cameraPos.clone().add(forward.multiplyScalar(this.data.distance));

    // Utilise l'API hit test de 8th Wall si disponible
    if (window.XR8 && XR8.XrController && XR8.XrController.hitTest) {
      // Converti la position 3D en coordonnées d'écran normalisées
      const screenX = 0.5; // Centre de l'écran
      const screenY = 0.5;

      const hits = XR8.XrController.hitTest(screenX, screenY);

      if (hits && hits.length > 0) {
        // Prend le premier hit (surface la plus proche)
        const hit = hits[0];

        // Place le modèle sur la surface détectée
        this.el.object3D.position.set(
          hit.position.x,
          hit.position.y,
          hit.position.z
        );

        console.log('Model placed on detected surface at:', hit.position);
        this.placed = true;
        this.el.setAttribute('visible', true);
        this.el.emit('placed-on-surface');
        return;
      }
    }

    // Fallback : place à la position calculée (si pas de hit test disponible)
    targetPos.y = 0; // Au niveau du sol par défaut
    this.el.object3D.position.copy(targetPos);
    this.el.setAttribute('visible', true);
    this.placed = true;
    console.log('Model placed at fallback position:', targetPos);
  },

  tick: function() {
    // Continue d'essayer jusqu'à ce que le placement réussisse
    if (this.data.enabled && this.data.autoPlace && !this.placed && this.camera) {
      this.placeOnSurface();
    }
  }
});

// ========================================
// COMPOSANT: Smooth Position (Anti-Jitter)
// DÉSACTIVÉ EN MODE AR - ACTIF UNIQUEMENT EN MODE 3D VIEWER
// ========================================
AFRAME.registerComponent('smooth-position', {
  schema: {
    enabled: {default: false}, // Désactivé par défaut (pour AR)
    factor: {default: 0.15} // 0.1 = très smooth mais latence, 0.3 = moins smooth mais réactif
  },

  init: function() {
    this.targetPosition = new THREE.Vector3();
    this.smoothPosition = new THREE.Vector3();
    this.firstUpdate = true;
  },

  tick: function() {
    // NE PAS APPLIQUER en mode AR (interfère avec le tracking)
    if (!this.data.enabled) return;
    if (!this.el.object3D.visible) return;

    // Première frame : initialise la position smooth
    if (this.firstUpdate) {
      this.smoothPosition.copy(this.el.object3D.position);
      this.firstUpdate = false;
      return;
    }

    // Récupère la position cible (du tracking AR)
    this.targetPosition.copy(this.el.object3D.position);

    // Interpolation smooth (lerp)
    this.smoothPosition.lerp(this.targetPosition, this.data.factor);

    // Applique la position smooth
    this.el.object3D.position.copy(this.smoothPosition);
  }
});

// ========================================
// COMPOSANT: Extend Camera Near Plane
// ========================================
AFRAME.registerComponent('extend-camera-near', {
  init: function() {
    // Attend que la caméra soit initialisée
    const checkCamera = () => {
      const camera = this.el.getObject3D('camera');
      if (camera && camera.isPerspectiveCamera) {
        // Permet de s'approcher TRÈS près (1cm au lieu de 10cm)
        camera.near = 0.01;
        camera.far = 10000;
        camera.updateProjectionMatrix();
        console.log('Camera near plane extended to 0.01m');
      } else {
        // Réessaie dans 100ms si la caméra n'est pas prête
        setTimeout(checkCamera, 100);
      }
    };

    checkCamera();
  }
});

// ========================================
// A-Frame Custom Component: 3D Viewer Orbit Controls
// ========================================

AFRAME.registerComponent('viewer-orbit-controls', {
  schema: {
    enabled: { type: 'boolean', default: false },
    minDistance: { type: 'number', default: 0.5 },
    maxDistance: { type: 'number', default: 5 },
    rotationSpeed: { type: 'number', default: 0.5 },
    zoomSpeed: { type: 'number', default: 0.1 }
  },

  init: function () {
    this.startY = 0;
    this.startX = 0;
    this.currentRotationY = 0;
    this.currentRotationX = 0;
    this.startDistance = 0;
    this.currentDistance = 3; // Default distance
    this.isDragging = false;
    this.isPinching = false;

    // Bind event handlers
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
  },

  update: function (oldData) {
    if (this.data.enabled && !oldData.enabled) {
      this.enable();
    } else if (!this.data.enabled && oldData.enabled) {
      this.disable();
    }
  },

  enable: function () {
    const sceneEl = this.el.sceneEl;
    sceneEl.canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    sceneEl.canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    sceneEl.canvas.addEventListener('touchend', this.onTouchEnd);
  },

  disable: function () {
    const sceneEl = this.el.sceneEl;
    sceneEl.canvas.removeEventListener('touchstart', this.onTouchStart);
    sceneEl.canvas.removeEventListener('touchmove', this.onTouchMove);
    sceneEl.canvas.removeEventListener('touchend', this.onTouchEnd);
  },

  onTouchStart: function (evt) {
    if (!this.data.enabled) return;

    if (evt.touches.length === 1) {
      // Single touch - rotation
      this.isDragging = true;
      this.startX = evt.touches[0].clientX;
      this.startY = evt.touches[0].clientY;
      evt.preventDefault();
    } else if (evt.touches.length === 2) {
      // Two fingers - zoom
      this.isPinching = true;
      this.isDragging = false;
      const dx = evt.touches[0].clientX - evt.touches[1].clientX;
      const dy = evt.touches[0].clientY - evt.touches[1].clientY;
      this.startDistance = Math.sqrt(dx * dx + dy * dy);
      evt.preventDefault();
    }
  },

  onTouchMove: function (evt) {
    if (!this.data.enabled) return;

    if (this.isDragging && evt.touches.length === 1) {
      // Rotate model
      const deltaX = evt.touches[0].clientX - this.startX;
      const deltaY = evt.touches[0].clientY - this.startY;

      this.currentRotationY += deltaX * this.data.rotationSpeed * 0.01;
      this.currentRotationX -= deltaY * this.data.rotationSpeed * 0.01;

      // Clamp X rotation to avoid flipping
      this.currentRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.currentRotationX));

      this.el.object3D.rotation.set(this.currentRotationX, this.currentRotationY, 0);

      this.startX = evt.touches[0].clientX;
      this.startY = evt.touches[0].clientY;
      evt.preventDefault();
    } else if (this.isPinching && evt.touches.length === 2) {
      // Zoom (scale model)
      const dx = evt.touches[0].clientX - evt.touches[1].clientX;
      const dy = evt.touches[0].clientY - evt.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const delta = (distance - this.startDistance) * this.data.zoomSpeed * 0.01;

      const currentScale = this.el.object3D.scale.x;
      const newScale = Math.max(0.5, Math.min(5, currentScale + delta));

      this.el.object3D.scale.set(newScale, newScale, newScale);

      this.startDistance = distance;
      evt.preventDefault();
    }
  },

  onTouchEnd: function (evt) {
    if (evt.touches.length === 0) {
      this.isDragging = false;
      this.isPinching = false;
    } else if (evt.touches.length === 1) {
      this.isPinching = false;
      // Restart single touch tracking
      this.isDragging = true;
      this.startX = evt.touches[0].clientX;
      this.startY = evt.touches[0].clientY;
    }
  },

  remove: function () {
    this.disable();
  },

  resetState: function () {
    this.startX = 0;
    this.startY = 0;
    this.currentRotationX = 0;
    this.currentRotationY = 0;
    this.startDistance = 0;
    this.currentDistance = 3;
    this.isDragging = false;
    this.isPinching = false;

    if (this.el && this.el.object3D) {
      this.el.object3D.rotation.set(0, 0, 0);
    }
  }
});

// ========================================
// UI Manager - Handle all UI interactions
// ========================================

const UIManager = (() => {
  // State
  let dishes = [];
  let currentFilter = 'all';
  let selectedDishId = null;
  let onDishSelectCallback = null;

  // DOM Elements (will be initialized)
  let elements = {};

  // Initialize UI Manager
  const init = (dishesData, onDishSelect) => {
    dishes = dishesData;
    onDishSelectCallback = onDishSelect;

    // Cache DOM elements
    elements = {
      restaurantLogo: document.getElementById('restaurant-logo'),
      dishName: document.getElementById('dish-name'),
      dishDescription: document.getElementById('dish-description'),
      carousel: document.getElementById('carousel'),
      filterBtn: document.getElementById('filter-btn'),
      filterBtnText: document.getElementById('filter-btn-text'),
      filterDropdown: document.getElementById('filter-dropdown'),
      loader: document.getElementById('loader'),
      errorMessage: document.getElementById('error-message'),
      errorText: document.getElementById('error-text'),
    };

    // Setup event listeners
    setupEventListeners();

    // Render initial carousel
    renderCarousel();

    // Select first dish (UI only, don't load model yet)
    if (dishes.length > 0) {
      selectedDishId = dishes[0].id;
      updateDishInfo(dishes[0]);
      updateSelectedThumbnail(dishes[0].id);
      // Don't call onDishSelectCallback yet - wait for user to click
    }
  };

  // Setup all event listeners
  const setupEventListeners = () => {
    // Filter button toggle
    elements.filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFilterDropdown();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!elements.filterBtn.contains(e.target) && !elements.filterDropdown.contains(e.target)) {
        closeFilterDropdown();
      }
    });

    // Prevent carousel scroll from closing dropdown
    elements.carousel.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  };

  // Render carousel based on current filter
  const renderCarousel = () => {
    const filteredDishes = getFilteredDishes();

    // Clear carousel
    elements.carousel.innerHTML = '';

    // Generate thumbnails
    filteredDishes.forEach(dish => {
      const thumb = createDishThumbnail(dish);
      elements.carousel.appendChild(thumb);
    });

    // Re-select current dish if it's still in filtered list
    if (selectedDishId && filteredDishes.find(d => d.id === selectedDishId)) {
      updateSelectedThumbnail(selectedDishId);
    } else if (filteredDishes.length > 0) {
      // Select first dish if current selection is filtered out
      selectDish(filteredDishes[0].id);
    }
  };

  // Create dish thumbnail element
  const createDishThumbnail = (dish) => {
    const thumb = document.createElement('div');
    thumb.className = 'dish-thumb';
    thumb.dataset.dishId = dish.id;

    const img = document.createElement('img');
    img.src = dish.thumbnailUrl;
    img.alt = dish.name;
    img.loading = 'lazy';

    // Handle image load error
    img.onerror = () => {
      img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23333" width="100" height="100"/%3E%3Ctext x="50" y="50" text-anchor="middle" dy=".3em" fill="%23999" font-size="40"%3E?%3C/text%3E%3C/svg%3E';
    };

    thumb.appendChild(img);

    // Click handler
    thumb.addEventListener('click', () => {
      selectDish(dish.id);
    });

    return thumb;
  };

  // Get filtered dishes based on current filter
  const getFilteredDishes = () => {
    if (currentFilter === 'all') {
      return dishes;
    }
    return dishes.filter(dish => dish.category === currentFilter);
  };

  // Select a dish
  const selectDish = (dishId) => {
    const dish = dishes.find(d => d.id === dishId);
    if (!dish) return;

    selectedDishId = dishId;

    // Update UI
    updateDishInfo(dish);
    updateSelectedThumbnail(dishId);

    // Scroll to selected thumbnail
    scrollToThumbnail(dishId);

    // Trigger callback to load 3D model
    if (onDishSelectCallback) {
      onDishSelectCallback(dish);
    }
  };

  // Update dish info (name, description)
  const updateDishInfo = (dish) => {
    elements.dishName.textContent = dish.name;
    elements.dishDescription.textContent = dish.description;
  };

  // Update selected thumbnail styling
  const updateSelectedThumbnail = (dishId) => {
    // Remove previous selection
    const prevSelected = elements.carousel.querySelector('.dish-thumb.selected');
    if (prevSelected) {
      prevSelected.classList.remove('selected');
    }

    // Add selection to new thumbnail
    const newSelected = elements.carousel.querySelector(`[data-dish-id="${dishId}"]`);
    if (newSelected) {
      newSelected.classList.add('selected');
    }
  };

  // Scroll to selected thumbnail
  const scrollToThumbnail = (dishId) => {
    const thumb = elements.carousel.querySelector(`[data-dish-id="${dishId}"]`);
    if (!thumb) return;

    const carousel = elements.carousel.parentElement;
    const thumbLeft = thumb.offsetLeft;
    const thumbWidth = thumb.offsetWidth;
    const carouselWidth = carousel.offsetWidth;

    // Center the thumbnail
    const scrollLeft = thumbLeft - (carouselWidth / 2) + (thumbWidth / 2);

    carousel.scrollTo({
      left: scrollLeft,
      behavior: 'smooth'
    });
  };

  // Toggle filter dropdown
  const toggleFilterDropdown = () => {
    const isOpen = elements.filterDropdown.classList.contains('show');
    if (isOpen) {
      closeFilterDropdown();
    } else {
      openFilterDropdown();
    }
  };

  // Open filter dropdown
  const openFilterDropdown = () => {
    elements.filterDropdown.classList.add('show');
    elements.filterBtn.classList.add('active');
  };

  // Close filter dropdown
  const closeFilterDropdown = () => {
    elements.filterDropdown.classList.remove('show');
    elements.filterBtn.classList.remove('active');
  };

  // Set filter category
  const setFilter = (category) => {
    currentFilter = category;

    // Update button text
    const categoryText = category.charAt(0).toUpperCase() + category.slice(1);
    elements.filterBtnText.textContent = categoryText;

    // Update active option
    const options = elements.filterDropdown.querySelectorAll('.filter-option');
    options.forEach(option => {
      option.classList.toggle('active', option.dataset.category === category);
    });

    // Re-render carousel
    renderCarousel();

    // Close dropdown
    closeFilterDropdown();
  };

  // Generate filter options based on available categories
  const generateFilterOptions = () => {
    const categories = ['all'];

    // Extract unique categories from dishes
    dishes.forEach(dish => {
      if (!categories.includes(dish.category)) {
        categories.push(dish.category);
      }
    });

    // Clear dropdown
    elements.filterDropdown.innerHTML = '';

    // Create options
    categories.forEach(category => {
      const option = document.createElement('div');
      option.className = 'filter-option';
      if (category === currentFilter) {
        option.classList.add('active');
      }
      option.dataset.category = category;
      option.textContent = category.charAt(0).toUpperCase() + category.slice(1);

      option.addEventListener('click', (e) => {
        e.stopPropagation();
        setFilter(category);
      });

      elements.filterDropdown.appendChild(option);
    });
  };

  // Set restaurant logo
  const setRestaurantLogo = (logoUrl) => {
    if (!logoUrl || !elements.restaurantLogo) return;

    elements.restaurantLogo.src = logoUrl;
    elements.restaurantLogo.onerror = () => {
      // Fallback to placeholder
      elements.restaurantLogo.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ccircle fill="%23333" cx="50" cy="50" r="50"/%3E%3Ctext x="50" y="50" text-anchor="middle" dy=".3em" fill="%23999" font-size="30"%3ER%3C/text%3E%3C/svg%3E';
    };
  };

  // Show loader
  const showLoader = () => {
    if (elements.loader) {
      elements.loader.classList.add('show');
    }
  };

  // Hide loader
  const hideLoader = () => {
    if (elements.loader) {
      elements.loader.classList.remove('show');
    }
  };

  // Show error message
  const showError = (message, duration = 3000) => {
    if (!elements.errorMessage || !elements.errorText) return;

    elements.errorText.textContent = message;
    elements.errorMessage.classList.add('show');

    // Auto-hide after duration
    setTimeout(() => {
      hideError();
    }, duration);
  };

  // Hide error message
  const hideError = () => {
    if (elements.errorMessage) {
      elements.errorMessage.classList.remove('show');
    }
  };

  // Public API
  return {
    init,
    setRestaurantLogo,
    generateFilterOptions,
    showLoader,
    hideLoader,
    showError,
    hideError,
    selectDish,
  };
})();

// ========================================
// AR Restaurant Menu - Main Application
// ========================================

// Configuration
const CONFIG = {
  // URL to your dishes.json file on Cloudflare R2 CDN
  dishesJsonUrl: 'https://pub-e4443a68f0ab47a485ec4603d6902c2a.r2.dev/dishes.json',

  // Fallback: embedded dishes data (for testing)
  useEmbeddedData: false, // Set to false to load from JSON file
};

// Embedded dishes data (fallback for testing)
const EMBEDDED_DISHES_DATA = {
  "restaurantLogo": "https://letsenhance.io/static/73136da51c245e80edc6ccfe44888a99/396e9/MainBefore.jpg",
  "dishes": [
    {
      "id": "dish-1",
      "name": "Poulet Pâtes",
      "description": "Pasta with chicken",
      "category": "plats",
      "modelUrl": "https://pub-e4443a68f0ab47a485ec4603d6902c2a.r2.dev/Poulet-pate.glb",
      "thumbnailUrl": "https://letsenhance.io/static/73136da51c245e80edc6ccfe44888a99/396e9/MainBefore.jpg",
      "scale": 3.0
    },
    {
      "id": "dish-2",
      "name": "Macarons (KTX2)",
      "description": "Delicious French macarons",
      "category": "dessert",
      "modelUrl": "https://pub-e4443a68f0ab47a485ec4603d6902c2a.r2.dev/macaronsVF-ktx2.glb",
      "thumbnailUrl": "https://letsenhance.io/static/73136da51c245e80edc6ccfe44888a99/396e9/MainBefore.jpg",
      "scale": 3.0
    }
  ]
};

// Application State
const AppState = {
  isARMode: true, // START IN AR MODE
  currentDish: null,
  dishesData: null,
  scene: null,
  modelEntity: null,
  camera: null,
  ground: null,
  viewerBackground: null,
  viewerCurtain: null,
  modelOriginalParent: null,
};

// ========================================
// Initialize Application
// ========================================
const initApp = async () => {
  try {
    console.log('Starting app initialization...');

    // Wait for DOM to be ready
    await waitForDOMReady();
    console.log('DOM ready');

    // Wait for scene to be available in DOM
    await waitForSceneAvailable();
    console.log('Scene available in DOM');

    // Get references to scene elements
    AppState.scene = document.querySelector('a-scene');
    AppState.modelEntity = document.querySelector('#model');
    AppState.camera = document.querySelector('#camera');
    AppState.ground = document.querySelector('#ground');
    AppState.viewerBackground = document.querySelector('#viewer-background');
    AppState.viewerCurtain = document.querySelector('#viewer-curtain');
    AppState.modelOriginalParent = AppState.modelEntity ? AppState.modelEntity.parentElement : null;

    console.log('Scene elements:', {
      scene: !!AppState.scene,
      model: !!AppState.modelEntity,
      camera: !!AppState.camera,
      ground: !!AppState.ground,
      viewerBg: !!AppState.viewerBackground,
      viewerCurtain: !!AppState.viewerCurtain
    });

    // START IN AR MODE
    console.log('Starting in AR mode');
    activateARMode();

    // Setup AR toggle button
    const arToggleBtn = document.querySelector('#ar-toggle-btn');
    if (arToggleBtn) {
      arToggleBtn.textContent = 'AR';
      arToggleBtn.addEventListener('click', toggleARMode);
      console.log('AR toggle button setup');
    }

    // Wait for scene to be loaded
    if (AppState.scene.hasLoaded) {
      onSceneLoaded();
    } else {
      AppState.scene.addEventListener('loaded', onSceneLoaded);
    }

    // Load dishes data
    await loadDishesData();

  } catch (error) {
    console.error('App initialization failed:', error);
    const errorEl = document.querySelector('#error-message');
    const errorTextEl = document.querySelector('#error-text');
    if (errorEl && errorTextEl) {
      errorTextEl.textContent = 'Failed to initialize app. Please refresh.';
      errorEl.classList.add('show');
    }
  }
};

// ========================================
// Scene Loaded Handler
// ========================================
const onSceneLoaded = () => {
  console.log('A-Frame scene loaded');

  // Initialize UI if data is already loaded
  if (AppState.dishesData) {
    initializeUI();
  }
};

// ========================================
// Load Dishes Data from JSON
// ========================================
const loadDishesData = async () => {
  try {
    console.log('Loading dishes data...');
    UIManager.showLoader();

    let data;

    if (CONFIG.useEmbeddedData) {
      // Use embedded data (no fetch)
      console.log('Using embedded dishes data');
      data = EMBEDDED_DISHES_DATA;
    } else {
      // Fetch from URL
      console.log('Fetching dishes data from:', CONFIG.dishesJsonUrl);
      const response = await fetch(CONFIG.dishesJsonUrl);
      console.log('Fetch response:', response.status, response.statusText);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      console.log('Content-Type:', contentType);

      if (!contentType || !contentType.includes('application/json')) {
        console.warn('Response is not JSON, falling back to embedded data');
        data = EMBEDDED_DISHES_DATA;
      } else {
        data = await response.json();
        console.log('JSON data loaded from URL:', data);
      }
    }

    if (!data.dishes || !Array.isArray(data.dishes) || data.dishes.length === 0) {
      throw new Error('Invalid dishes data format');
    }

    console.log('Found', data.dishes.length, 'dishes');
    AppState.dishesData = data;

    // Initialize UI if scene is already loaded
    if (AppState.scene && AppState.scene.hasLoaded) {
      console.log('Scene already loaded, initializing UI immediately');
      initializeUI();
    } else {
      console.log('Scene not loaded yet, waiting for scene load event');
    }

    UIManager.hideLoader();

  } catch (error) {
    console.error('Failed to load dishes data:', error);
    console.error('Error details:', error.message, error.stack);

    // Try fallback to embedded data
    console.log('Attempting fallback to embedded data');
    try {
      AppState.dishesData = EMBEDDED_DISHES_DATA;
      if (AppState.scene && AppState.scene.hasLoaded) {
        initializeUI();
      }
      UIManager.hideLoader();
    } catch (fallbackError) {
      UIManager.hideLoader();
      UIManager.showError('Failed to load menu. Please refresh.');
    }
  }
};

// ========================================
// Initialize UI
// ========================================
const initializeUI = () => {
  console.log('Initializing UI...');
  console.log('Dishes data:', AppState.dishesData);

  // Set restaurant logo
  console.log('Setting restaurant logo:', AppState.dishesData.restaurantLogo);
  UIManager.setRestaurantLogo(AppState.dishesData.restaurantLogo);

  // Initialize UI Manager with dishes data
  console.log('Initializing UI Manager with', AppState.dishesData.dishes.length, 'dishes');
  UIManager.init(AppState.dishesData.dishes, onDishSelected);

  // Generate filter options
  console.log('Generating filter options');
  UIManager.generateFilterOptions();

  console.log('UI initialization complete');

  // Load first dish model automatically
  if (AppState.dishesData.dishes.length > 0) {
    console.log('Auto-loading first dish model');
    onDishSelected(AppState.dishesData.dishes[0]);
  }
};

// ========================================
// Handle Dish Selection
// ========================================
const onDishSelected = async (dish) => {
  try {
    console.log('Loading dish:', dish.name);

    AppState.currentDish = dish;

    // Show loader while model loads
    UIManager.showLoader();

    // Load the 3D model
    await loadDishModel(dish);

  } catch (error) {
    console.error('Failed to load dish model:', error);
    UIManager.hideLoader();
    UIManager.showError('Failed to load 3D model');
  }
};

// ========================================
// Load Dish 3D Model
// ========================================
const loadDishModel = (dish) => {
  return new Promise((resolve, reject) => {
    try {
      console.log('=== LOAD DISH MODEL DEBUG (INLINE METHOD) ===');
      console.log('Dish object:', dish);
      console.log('Model URL:', dish.modelUrl);

      // Remove old event listeners if any
      const oldModelLoaded = AppState.modelEntity.components['gltf-model'];
      if (oldModelLoaded) {
        console.log('Removing old gltf-model component');
      }

      // Set scale from dish data
      const scale = dish.scale || 1.0;
      AppState.modelEntity.setAttribute('scale', `${scale} ${scale} ${scale}`);
      console.log(`✓ Scale set to: ${scale}`);

      // Make sure entity is visible
      AppState.modelEntity.setAttribute('visible', 'true');
      console.log('✓ Visibility set to true');

      // Check position
      const position = AppState.modelEntity.getAttribute('position');
      console.log('Current position:', position);

      // Listen for model load complete
      const onModelLoaded = () => {
        console.log('✓✓✓ Model loaded successfully! ✓✓✓');
        const object3D = AppState.modelEntity.getObject3D('mesh');
        console.log('Model 3D object:', object3D);

        // Log bounding box to check size
        if (object3D) {
          const bbox = new THREE.Box3().setFromObject(object3D);
          console.log('Model bounding box:', bbox);
          console.log('Model size:', {
            x: bbox.max.x - bbox.min.x,
            y: bbox.max.y - bbox.min.y,
            z: bbox.max.z - bbox.min.z
          });
        }

        UIManager.hideLoader();
        AppState.modelEntity.removeEventListener('model-loaded', onModelLoaded);
        resolve();
      };

      const onModelError = (evt) => {
        console.error('✗✗✗ Model loading error ✗✗✗');
        console.error('Error event:', evt);
        console.error('Error detail:', evt.detail);
        UIManager.hideLoader();
        AppState.modelEntity.removeEventListener('model-error', onModelError);
        reject(new Error('Failed to load model'));
      };

      AppState.modelEntity.addEventListener('model-loaded', onModelLoaded);
      AppState.modelEntity.addEventListener('model-error', onModelError);

      // Set gltf-model with direct URL (NO url() wrapper - that's CSS syntax!)
      console.log('Setting gltf-model with direct URL');
      AppState.modelEntity.setAttribute('gltf-model', dish.modelUrl);
      console.log('✓ gltf-model attribute set to:', dish.modelUrl);

      // Fallback timeout to hide loader
      setTimeout(() => {
        console.log('Fallback timeout reached (5 seconds)');
        const hasModel = AppState.modelEntity.getObject3D('mesh');
        console.log('Has model after timeout?', !!hasModel);
        if (hasModel) {
          const bbox = new THREE.Box3().setFromObject(hasModel);
          console.log('Final bounding box:', bbox);
        }
        UIManager.hideLoader();
        resolve();
      }, 5000);

    } catch (error) {
      console.error('Exception in loadDishModel:', error);
      UIManager.hideLoader();
      reject(error);
    }
  });
};

// ========================================
// Toggle AR Mode / 3D Viewer Mode
// ========================================
const toggleARMode = () => {
  AppState.isARMode = !AppState.isARMode;

  const arToggleBtn = document.querySelector('#ar-toggle-btn');

  if (AppState.isARMode) {
    // Switch to AR Mode
    activateARMode();
    arToggleBtn.textContent = 'AR';
  } else {
    // Switch to 3D Viewer Mode
    activate3DViewerMode();
    arToggleBtn.textContent = '3D';
  }
};

// ========================================
// Activate AR Mode
// ========================================
const activateARMode = () => {
  console.log('Activating AR Mode');

  // Remove viewer mode class from body
  document.body.classList.remove('viewer-mode');

  // Hide viewer background (show camera feed)
  if (AppState.viewerBackground) {
    AppState.viewerBackground.classList.remove('show');
  }

  if (AppState.viewerCurtain) {
    AppState.viewerCurtain.setAttribute('visible', 'false');
  }

  // Disable 3D viewer orbit controls
  if (AppState.modelEntity) {
    if (AppState.modelOriginalParent && AppState.modelEntity.parentElement !== AppState.modelOriginalParent) {
      AppState.modelOriginalParent.appendChild(AppState.modelEntity);
    }

    AppState.modelEntity.setAttribute('viewer-orbit-controls', 'enabled', false);

    const orbitControls = AppState.modelEntity.components['viewer-orbit-controls'];
    if (orbitControls && typeof orbitControls.resetState === 'function') {
      orbitControls.resetState();
    }

    // Re-enable AR gesture controls
    AppState.modelEntity.setAttribute('xrextras-hold-drag', 'dragDelay: 0');
    AppState.modelEntity.setAttribute('xrextras-two-finger-rotate', '');
    AppState.modelEntity.setAttribute('xrextras-pinch-scale', 'min: 0.5; max: 3');

    // ENABLE smooth-position in AR mode (lisse les sauts du tracking)
    AppState.modelEntity.setAttribute('smooth-position', 'enabled', true);

    // ENABLE place-on-surface in AR mode (placement automatique sur surface détectée)
    AppState.modelEntity.setAttribute('place-on-surface', 'enabled', true);

    // La position sera définie automatiquement par place-on-surface
    // On ne force plus la position ici

    // Reset scale to dish default
    if (AppState.currentDish) {
      const scale = AppState.currentDish.scale || 1.0;
      AppState.modelEntity.setAttribute('scale', `${scale} ${scale} ${scale}`);
    }
  }

  // Show ground plane
  if (AppState.ground) {
    AppState.ground.setAttribute('visible', 'true');
  }
};

// ========================================
// Activate 3D Viewer Mode (iOS QuickLook style)
// ========================================
const activate3DViewerMode = () => {
  console.log('Activating 3D Viewer Mode (QuickLook style)');

  // Add viewer mode class to body to hide camera feed
  document.body.classList.add('viewer-mode');

  // Show gradient background (hide camera feed)
  if (AppState.viewerBackground) {
    AppState.viewerBackground.classList.add('show');
  }

  if (AppState.viewerCurtain) {
    AppState.viewerCurtain.setAttribute('visible', 'true');
  }

  // Disable AR gesture controls
  if (AppState.modelEntity) {
    AppState.modelEntity.removeAttribute('xrextras-hold-drag');
    AppState.modelEntity.removeAttribute('xrextras-two-finger-rotate');
    AppState.modelEntity.removeAttribute('xrextras-pinch-scale');

    if (AppState.camera && AppState.modelEntity.parentElement !== AppState.camera) {
      AppState.camera.appendChild(AppState.modelEntity);
    }

    // Enable 3D viewer orbit controls
    AppState.modelEntity.setAttribute('viewer-orbit-controls', {
      enabled: true,
      rotationSpeed: 1.0,
      zoomSpeed: 1.0
    });

    // DISABLE smooth-position in 3D mode (pas nécessaire, position fixe)
    AppState.modelEntity.setAttribute('smooth-position', 'enabled', false);

    // DISABLE place-on-surface in 3D mode (pas de placement automatique)
    AppState.modelEntity.setAttribute('place-on-surface', 'enabled', false);

    // Center model in front of camera (fixed position for QuickLook style)
    AppState.modelEntity.setAttribute('position', '0 0 -2');
    AppState.modelEntity.setAttribute('rotation', '0 0 0');

    // Set scale to dish default
    if (AppState.currentDish) {
      const scale = AppState.currentDish.scale || 1.0;
      AppState.modelEntity.setAttribute('scale', `${scale} ${scale} ${scale}`);
    }

    const orbitControls = AppState.modelEntity.components['viewer-orbit-controls'];
    if (orbitControls && typeof orbitControls.resetState === 'function') {
      orbitControls.resetState();
    }

    console.log('Model centered at: 0 0 -2 (QuickLook style)');
  }

  // Hide ground plane in viewer mode
  if (AppState.ground) {
    AppState.ground.setAttribute('visible', 'false');
  }

  // Note: We keep XR system active to avoid re-requesting camera permissions
  // The gradient background covers the camera feed visually
};

// ========================================
// Utility: Wait for DOM Ready
// ========================================
const waitForDOMReady = () => {
  return new Promise((resolve) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', resolve);
    } else {
      resolve();
    }
  });
};

// ========================================
// Utility: Wait for A-Frame Scene
// ========================================
const waitForSceneAvailable = () => {
  return new Promise((resolve) => {
    const checkScene = () => {
      const scene = document.querySelector('a-scene');
      if (scene) {
        console.log('Scene found in DOM');
        resolve();
      } else {
        console.log('Waiting for scene...');
        setTimeout(checkScene, 100);
      }
    };
    checkScene();
  });
};

// ========================================
// Start Application
// ========================================
initApp();
