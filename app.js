// --- App Configuration ---
const STORE_DOMAIN = 'duskly-4.myshopify.com';
const STOREFRONT_ACCESS_TOKEN = '1a563fd710335fa5a1f952184766c2f8';
const API_VERSION = '2024-01';
const API_URL = `https://${STORE_DOMAIN}/api/${API_VERSION}/graphql.json`;

// --- Flywear Loading Animation ---
function initFlywearLoader() {
    const screen = document.querySelector('.flywear-loader-screen');
    if (!screen) return;

    const letters = screen.querySelectorAll('.flywear-loader__letter');
    const box = screen.querySelectorAll('.flywear-loader__box');
    const growingImage = screen.querySelectorAll('.flywear-loader__growing-image');
    const headingStart = screen.querySelectorAll('.flywear-loader__h1-start');
    const headingEnd = screen.querySelectorAll('.flywear-loader__h1-end');
    const coverExtras = screen.querySelectorAll('.flywear-loader__cover-extra');

    const tl = gsap.timeline({
        defaults: { ease: 'expo.inOut' },
        onStart: () => {
            screen.classList.remove('is--hidden');
            screen.style.display = 'block';
        },
        onComplete: () => {
            gsap.to(screen, {
                opacity: 0,
                duration: 0.6,
                ease: 'power2.out',
                onComplete: () => {
                    screen.remove();
                }
            });
        }
    });

    // Letters slide up
    if (letters.length) {
        tl.from(letters, { yPercent: 120, stagger: 0.04, duration: 1.25 });
    }

    // Brief hold so user reads the title
    tl.to({}, { duration: 0.4 });

    // Box expands
    if (box.length) {
        tl.fromTo(box, { width: '0em' }, { width: '1em', duration: 1.25 });
    }

    // Growing image expands inside box
    if (growingImage.length) {
        tl.fromTo(growingImage, { width: '0%' }, { width: '100%', duration: 1.25 }, '<');
    }

    // Heading halves nudge apart
    if (headingStart.length) {
        tl.fromTo(headingStart, { x: '0em' }, { x: '-0.05em', duration: 1.25 }, '<');
    }
    if (headingEnd.length) {
        tl.fromTo(headingEnd, { x: '0em' }, { x: '0.05em', duration: 1.25 }, '<');
    }

    // Cover image extras fade out in sequence
    if (coverExtras.length) {
        tl.fromTo(coverExtras, { opacity: 1 }, { opacity: 0, duration: 0.05, ease: 'none', stagger: 0.5 }, '-=0.05');
    }

    // Growing image expands to full viewport
    if (growingImage.length) {
        tl.to(growingImage, { width: '100vw', height: '100dvh', duration: 2 }, '< 1.25');
    }
    if (box.length) {
        tl.to(box, { width: '110vw', duration: 2 }, '<');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initFlywearLoader();
});

// --- State Management ---
let cart = [];
let cartId = localStorage.getItem('flywear_cart_id');

// --- DOM Elements ---
const appRoot = document.getElementById('app');
const cartToggleBtn = document.getElementById('cart-toggle');
const closeCartBtn = document.getElementById('close-cart');
const cartOverlay = document.getElementById('cart-overlay');
const cartSidebar = document.getElementById('cart-sidebar');
const cartItemsContainer = document.getElementById('cart-items');
const cartCountEl = document.getElementById('cart-count');
const cartSubtotalEl = document.getElementById('cart-subtotal');
const checkoutBtn = document.getElementById('checkout-btn');
const mobileMenuBtn = document.getElementById('mobile-menu-toggle');
const mobileNav = document.getElementById('mobile-nav');

// --- GraphQL Helper ---
async function shopifyFetch(query, variables = {}) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Storefront-Access-Token': STOREFRONT_ACCESS_TOKEN,
            },
            body: JSON.stringify({ query, variables })
        });

        const json = await response.json();
        if (json.errors) {
            console.error('GraphQL Errors:', json.errors);
            throw new Error('GraphQL query failed');
        }
        return json.data;
    } catch (error) {
        console.error('Shopify Fetch Error:', error);
        return null;
    }
}

// --- API Queries ---
async function getFeaturedProducts(count = 8) {
    const query = `
        query getFeaturedProducts($first: Int!) {
            products(first: $first, sortKey: BEST_SELLING) {
                edges {
                    node {
                        id title handle vendor availableForSale
                        priceRange { minVariantPrice { amount currencyCode } }
                        compareAtPriceRange { maxVariantPrice { amount currencyCode } }
                        images(first: 1) { edges { node { url altText } } }
                    }
                }
            }
        }
    `;
    const data = await shopifyFetch(query, { first: count });
    return data?.products?.edges.map(e => e.node) || [];
}

async function getAllProducts(first = 20, after = null) {
    const query = `
        query getProducts($first: Int!, $after: String) {
            products(first: $first, after: $after) {
                pageInfo { hasNextPage endCursor }
                edges {
                    node {
                        id title handle vendor availableForSale 
                        priceRange { minVariantPrice { amount currencyCode } }
                        compareAtPriceRange { maxVariantPrice { amount currencyCode } }
                        images(first: 1) { edges { node { url altText } } }
                    }
                }
            }
        }
    `;
    const data = await shopifyFetch(query, { first, after });
    return data?.products || { edges: [], pageInfo: {} };
}

async function getProductByHandle(handle) {
    const query = `
        query getProduct($handle: String!) {
            product(handle: $handle) {
                id title descriptionHtml vendor availableForSale
                priceRange { minVariantPrice { amount currencyCode } }
                compareAtPriceRange { maxVariantPrice { amount currencyCode } }
                images(first: 8) { edges { node { url altText } } }
                variants(first: 40) { edges { node { id title availableForSale price { amount currencyCode } compareAtPrice { amount currencyCode } image { url } } } }
            }
        }
    `;
    const data = await shopifyFetch(query, { handle });
    return data?.product || null;
}

// --- Cart Logic ---
async function createCart() {
    const query = `
        mutation cartCreate($input: CartInput!) {
            cartCreate(input: $input) {
                cart { id }
            }
        }
    `;
    const data = await shopifyFetch(query, { input: { lines: [] } });
    if (data?.cartCreate?.cart) {
        cartId = data.cartCreate.cart.id;
        localStorage.setItem('flywear_cart_id', cartId);
    }
}

async function addToCart(variantId, title, price, image, quantity = 1) {
    if (!cartId) await createCart();

    const existingIndex = cart.findIndex(item => item.variantId === variantId);
    if (existingIndex > -1) {
        cart[existingIndex].quantity += quantity;
    } else {
        cart.push({ variantId, title, price, image, quantity });
    }
    updateCartUI();
    openCart();
}

function updateCartUI() {
    cartCountEl.textContent = cart.reduce((acc, item) => acc + item.quantity, 0);

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<p class="empty-state">Your bag is currently empty.</p>';
        cartSubtotalEl.textContent = 'Rs. 0.00';
        return;
    }

    let subtotal = 0;
    cartItemsContainer.innerHTML = cart.map(item => {
        subtotal += item.price * item.quantity;
        return `
            <div class="cart-item">
                <img src="${item.image}" alt="${item.title}" class="cart-item-img">
                <div class="cart-item-info">
                    <h4 class="cart-item-title">${item.title}</h4>
                    <p class="cart-item-price">Rs. ${parseFloat(item.price).toFixed(2)}</p>
                    <div style="font-size:0.8rem; color:#888; margin-bottom: 0.5rem;">Qty: ${item.quantity}</div>
                    <button class="remove-item" onclick="removeFromCart('${item.variantId}')">Remove</button>
                </div>
            </div>
        `;
    }).join('');

    cartSubtotalEl.textContent = `Rs. ${subtotal.toFixed(2)}`;
}

window.removeFromCart = (variantId) => {
    cart = cart.filter(item => item.variantId !== variantId);
    updateCartUI();
};

function formatPrice(amount) {
    return parseFloat(amount).toFixed(2);
}

checkoutBtn.addEventListener('click', () => {
    if (cart.length === 0) return;
    const cartString = cart.map(item => {
        const idParts = item.variantId.split('/');
        return `${idParts[idParts.length - 1]}:${item.quantity}`;
    }).join(',');
    const checkoutUrl = `https://${STORE_DOMAIN}/cart/${cartString}`;
    closeCart();
    showPolicyPopup(checkoutUrl);
});

// --- UI Interactions ---
function openCart() {
    cartOverlay.classList.add('active');
    cartSidebar.classList.add('active');
}
function closeCart() {
    cartOverlay.classList.remove('active');
    cartSidebar.classList.remove('active');
}

cartToggleBtn.addEventListener('click', openCart);
closeCartBtn.addEventListener('click', closeCart);
cartOverlay.addEventListener('click', closeCart);

mobileMenuBtn.addEventListener('click', () => {
    mobileNav.classList.toggle('open');
});
document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', () => mobileNav.classList.remove('open'));
});

// --- View Rendering ---
function renderProductCard(product) {
    const price = product.priceRange.minVariantPrice.amount;
    const comparePrice = product.compareAtPriceRange?.maxVariantPrice?.amount;
    const isSale = comparePrice && parseFloat(comparePrice) > parseFloat(price);
    const image = product.images.edges[0]?.node?.url || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600';
    // If not available, show Sold out badge. Force some to show Sold out if mimicking the layout.
    const isAvailable = product.availableForSale !== undefined ? product.availableForSale : true;

    return `
        <div class="product-card" onclick="window.location.hash='#/product/${product.handle}'">
            <div class="product-image-wrap">
                <img src="${image}" alt="${product.title}" class="product-image" loading="lazy">
                ${isSale ? '<span class="sale-badge" style="position:absolute; top:10px; right:10px; background:#d32f2f; color:#fff; padding:2px 8px; font-size:0.75rem; border-radius:4px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; z-index:2;">Sale</span>' : ''}
            </div>
            <div class="product-info">
                <h3 class="product-title">${product.title}</h3>
                <div class="product-price">
                    ${isSale ? `<span class="compare-price" style="text-decoration: line-through; color: #999; margin-right: 0.5rem; font-size: 0.85em;">Rs. ${formatPrice(comparePrice)}</span>` : ''}
                    <span>Rs. ${formatPrice(price)}</span>
                </div>
            </div>
        </div>
    `;
}

async function renderHome() {
    appRoot.innerHTML = '<div class="loader loader--dark"><div class="loader-spinner"></div></div>';

    const products = await getFeaturedProducts(4); // Match 4 items in image grid
    let productsHtml = products.length > 0 ? products.map(renderProductCard).join('') : '';

    appRoot.innerHTML = `
        <section class="hero" style="width: 100%; height: auto; min-height: unset; display: block; margin: 0; padding: 0;">
            <picture style="width: 100%; display: block; margin: 0; padding: 0;">
                <!-- The desktop banner -->
                <img src="assets/banner2.png" class="hero-bg" alt="Flywear Banner" style="width: 100%; height: auto; display: block; object-fit: contain;">
            </picture>
        </section>

        <!-- Category Circles -->
        <section class="section container">
            <div class="category-circles">
                <a href="#/category/fashion" class="category-circle">
                    <div class="category-circle__icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20.38 3.46L16 2 12 5 8 2 3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>
                        </svg>
                    </div>
                    <span>Fashion</span>
                </a>
                <a href="#/category/watches" class="category-circle">
                    <div class="category-circle__icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="7"/><polyline points="12 9 12 12 13.5 13.5"/>
                            <path d="M16.51 17.35l-.35 3.83a2 2 0 0 1-2 1.82H9.83a2 2 0 0 1-2-1.82l-.35-3.83m.01-10.7l.35-3.83A2 2 0 0 1 9.83 1h4.35a2 2 0 0 1 2 1.82l.35 3.83"/>
                        </svg>
                    </div>
                    <span>Watches</span>
                </a>
                <a href="#/category/kids" class="category-circle">
                    <div class="category-circle__icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>
                            <path d="M12 3v0"/><circle cx="9" cy="7.5" r="0.5" fill="currentColor"/><circle cx="15" cy="7.5" r="0.5" fill="currentColor"/>
                            <path d="M9.5 10.5a3.5 3.5 0 0 0 5 0"/>
                        </svg>
                    </div>
                    <span>Kids</span>
                </a>
                <a href="#/category/accessories" class="category-circle">
                    <div class="category-circle__icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20 7h-4a2 2 0 0 0-2-2H10a2 2 0 0 0-2 2H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
                            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                        </svg>
                    </div>
                    <span>Accessories</span>
                </a>
                <a href="#/category/shoes" class="category-circle">
                    <div class="category-circle__icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M2 18h20v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1z"/>
                            <path d="M2 18l1.2-7.2A2 2 0 0 1 5.17 9H6l1-5h3l.5 2 1.5.5L13 9h5.83a2 2 0 0 1 1.97 1.8L22 18"/>
                        </svg>
                    </div>
                    <span>Shoes</span>
                </a>
                <a href="#/category/electronics" class="category-circle">
                    <div class="category-circle__icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
                        </svg>
                    </div>
                    <span>Electronics</span>
                </a>
                <a href="#/category/daily life" class="category-circle">
                    <div class="category-circle__icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                        </svg>
                    </div>
                    <span>Daily Life</span>
                </a>
                <a href="#/category/kitchen" class="category-circle">
                    <div class="category-circle__icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>
                        </svg>
                    </div>
                    <span>Kitchen</span>
                </a>
            </div>
        </section>

        <!-- Our Products -->
        <section class="section container">
            <div class="section-header">
                <h2 class="section-title">Our Products</h2>
            </div>
            <div class="product-grid">
                ${productsHtml || '<p class="empty-state">No products found.</p>'}
            </div>
            <div style="text-align: center; margin-top: 2.5rem;">
                <a href="#/shop" class="btn btn-primary">Show More</a>
            </div>
        </section>

        <!-- Split Promo Banner Block -->
        <section class="split-promo">
            <div class="promo-left">
                <div class="promo-card">
                    <div class="promo-card__image">
                        <img src="assets/poster1.png" alt="Clothes Stack">
                    </div>
                    <div class="promo-card__text">
                        <span class="promo-card__label">New Arrivals</span>
                        <h3>Curated Style</h3>
                        <p>Thoughtfully designed pieces for your everyday wardrobe.</p>
                        <a href="#/shop" class="btn btn-primary">Browse Collection</a>
                    </div>
                </div>
            </div>
            <div class="promo-right">
                <div class="promo-brand-box">
                    <img src="assets/logo_white.png" alt="Flywear" class="promo-brand-logo">
                    <p class="promo-brand-text">We bring you thoughtfully curated essentials — where premium quality meets everyday affordability.</p>
                    <a href="#/about" class="btn promo-brand-btn">About Us</a>
                </div>
            </div>
        </section>

        <!-- Shop By Collection Masonry -->
        <!-- Brand Poster Section -->
        <section class="brand-posters">
            <div class="poster-grid">
                <div class="poster-item poster-item--tall">
                    <img src="assets/poster3.png" alt="Style" loading="lazy">
                    <div class="poster-overlay">
                        <span class="poster-tag">Style</span>
                        <h3>Wear the<br>Difference</h3>
                    </div>
                </div>
                <div class="poster-item">
                    <img src="assets/poster4.png" alt="Comfort" loading="lazy">
                    <div class="poster-overlay">
                        <span class="poster-tag">Comfort</span>
                        <h3>Everyday Ease</h3>
                    </div>
                </div>
                <div class="poster-item">
                    <img src="assets/poster2.png" alt="Accessories" loading="lazy">
                    <div class="poster-overlay">
                        <span class="poster-tag">Accessories</span>
                        <h3>Complete the Look</h3>
                    </div>
                </div>
            </div>
            <div style="text-align: center; margin-top: 3rem;">
                <a href="#/shop" class="btn btn-primary">Shop the Look</a>
            </div>
        </section>
    `;
}

async function renderShop() {
    appRoot.innerHTML = '<div class="loader loader--dark"><div class="loader-spinner"></div></div>';

    const data = await getAllProducts(24);
    const products = data.edges.map(e => e.node);

    let productsHtml = products.length > 0 ? products.map(renderProductCard).join('') : '<p class="empty-state">No products found.</p>';

    appRoot.innerHTML = `
        <div class="container section">
            <div class="section-header">
                <h1 class="section-title">All Products</h1>
            </div>
            <div class="product-grid">
                ${productsHtml}
            </div>
        </div>
    `;
}

async function renderCategory(categoryId) {
    const decodedCategory = decodeURIComponent(categoryId);
    appRoot.innerHTML = `<div class="loader loader--dark"><div class="loader-spinner"></div></div>`;

    const query = `
        query getProductsByQuery($query: String!) {
            products(first: 20, query: $query) {
                edges {
                    node {
                        id title handle vendor availableForSale 
                        priceRange { minVariantPrice { amount currencyCode } }
                        compareAtPriceRange { maxVariantPrice { amount currencyCode } }
                        images(first: 1) { edges { node { url altText } } }
                    }
                }
            }
        }
    `;
    const data = await shopifyFetch(query, { query: decodedCategory });
    const products = data?.products?.edges.map(e => e.node) || [];

    let productsHtml = products.length > 0 ? products.map(renderProductCard).join('') : '<p class="empty-state">No items found.</p>';

    appRoot.innerHTML = `
        <div class="container section">
            <div class="section-header">
                <h1 class="section-title">${decodedCategory}</h1>
            </div>
            <div class="product-grid">
                ${productsHtml}
            </div>
        </div>
    `;
}

window.swapMainImage = (url) => { document.getElementById('main-product-image').src = url; };

window.updateVariantState = (selectObj) => {
    const option = selectObj.options[selectObj.selectedIndex];
    if (!option.value) return;
    const price = option.getAttribute('data-price');
    const comparePrice = option.getAttribute('data-compare-price');
    const available = option.getAttribute('data-available') === 'true';
    const variantImg = option.getAttribute('data-image');

    const priceHtml = (comparePrice && parseFloat(comparePrice) > parseFloat(price))
        ? `<span class="compare-price" style="text-decoration: line-through; color: #999; margin-right: 0.5rem; font-size: 0.85em;">Rs. ${parseFloat(comparePrice).toFixed(2)}</span> Rs. ${parseFloat(price).toFixed(2)}`
        : `Rs. ${parseFloat(price).toFixed(2)}`;

    document.getElementById('product-price-disp').innerHTML = priceHtml;

    if (variantImg) {
        document.getElementById('main-product-image').src = variantImg;
    }

    const addBtn = document.getElementById('add-to-bag-trigger');
    const buyBtn = document.getElementById('buy-now-trigger');

    addBtn.setAttribute('data-variant', selectObj.value);
    addBtn.setAttribute('data-price', price);
    if (variantImg) addBtn.setAttribute('data-image', variantImg);

    buyBtn.setAttribute('data-variant', selectObj.value);

    if (available) {
        addBtn.innerText = 'Add To Bag';
        addBtn.disabled = false;
        addBtn.removeAttribute('data-needs-variant');
        buyBtn.disabled = false;
        buyBtn.removeAttribute('data-needs-variant');
    } else {
        addBtn.innerText = 'Sold Out';
        addBtn.disabled = true;
        buyBtn.disabled = true;
    }
};

window.triggerAddToCart = (title, image) => {
    const btn = document.getElementById('add-to-bag-trigger');
    if (btn.hasAttribute('data-needs-variant')) { highlightVariantSelect(); return; }
    const overrideImage = btn.getAttribute('data-image') || image;
    addToCart(btn.getAttribute('data-variant'), title, btn.getAttribute('data-price'), overrideImage, parseInt(document.getElementById('qty-input').value) || 1);
};

window.triggerBuyNow = () => {
    const btn = document.getElementById('buy-now-trigger');
    if (btn.hasAttribute('data-needs-variant')) { highlightVariantSelect(); return; }
    const rawId = btn.getAttribute('data-variant').split('/').pop();
    const checkoutUrl = `https://${STORE_DOMAIN}/cart/${rawId}:${parseInt(document.getElementById('qty-input').value) || 1}`;
    showPolicyPopup(checkoutUrl);
};

// --- Policy Popup Logic ---
const policyOverlay = document.getElementById('policy-overlay');
const policyCloseBtn = document.getElementById('policy-close');
const policyAgreeCheck = document.getElementById('policy-agree-check');
const policyContinueBtn = document.getElementById('policy-continue-btn');
let pendingCheckoutUrl = '';

function showPolicyPopup(url) {
    pendingCheckoutUrl = url;
    policyAgreeCheck.checked = false;
    policyContinueBtn.disabled = true;
    policyOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closePolicyPopup() {
    policyOverlay.classList.remove('active');
    document.body.style.overflow = '';
    pendingCheckoutUrl = '';
}

policyCloseBtn.addEventListener('click', closePolicyPopup);
policyOverlay.addEventListener('click', (e) => {
    if (e.target === policyOverlay) closePolicyPopup();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && policyOverlay.classList.contains('active')) closePolicyPopup();
});

policyAgreeCheck.addEventListener('change', () => {
    policyContinueBtn.disabled = !policyAgreeCheck.checked;
});

policyContinueBtn.addEventListener('click', () => {
    if (pendingCheckoutUrl && policyAgreeCheck.checked) {
        window.location.href = pendingCheckoutUrl;
    }
});

// Highlight variant select when user tries to buy without selecting
function highlightVariantSelect() {
    const select = document.getElementById('variant-select');
    if (!select) return;

    // Scroll into view
    select.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Add highlight class
    select.classList.add('variant-highlight');

    // Show tooltip message
    let tooltip = document.getElementById('variant-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'variant-tooltip';
        tooltip.className = 'variant-tooltip';
        tooltip.textContent = '⚠ Please select an option first';
        select.parentElement.appendChild(tooltip);
    }
    tooltip.classList.add('active');

    // Remove after animation
    setTimeout(() => {
        select.classList.remove('variant-highlight');
        tooltip.classList.remove('active');
    }, 2500);
}

window.openLightbox = (url) => {
    document.getElementById('lightbox-img').src = url;
    document.getElementById('lightbox-overlay').classList.add('active');
};
window.closeLightbox = () => {
    document.getElementById('lightbox-overlay').classList.remove('active');
};

async function renderProductDetail(handle) {
    appRoot.innerHTML = '<div class="loader loader--dark"><div class="loader-spinner"></div></div>';

    const product = await getProductByHandle(handle);
    if (!product) {
        appRoot.innerHTML = '<div class="container section"><h2 class="section-title" style="text-align:center;">Product not found</h2></div>';
        return;
    }

    const firstVariant = product.variants.edges[0]?.node;
    const price = firstVariant?.price?.amount || product.priceRange.minVariantPrice.amount;
    const defaultComparePrice = firstVariant?.compareAtPrice?.amount || product.compareAtPriceRange?.maxVariantPrice?.amount;

    const priceHtml = (defaultComparePrice && parseFloat(defaultComparePrice) > parseFloat(price))
        ? `<span class="compare-price" style="text-decoration: line-through; color: #999; margin-right: 0.5rem; font-size: 0.85em;">Rs. ${formatPrice(defaultComparePrice)}</span> Rs. ${formatPrice(price)}`
        : `Rs. ${formatPrice(price)}`;

    const variants = product.variants.edges.map(e => e.node);
    const showVariants = variants.length > 1 && variants[0].title !== 'Default Title';

    let variantHtml = '';
    if (showVariants) {
        variantHtml = `
            <div class="variant-controls" style="margin-bottom: 1.5rem;">
                <label for="variant-select" style="font-weight: 500; font-size: 0.85rem; display: block; margin-bottom: 0.5rem;">Select Option</label>
                <select id="variant-select" onchange="window.updateVariantState(this)" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border); border-radius: 5px; font-family: var(--font-sans); background: #fff;">
                    <option value="" disabled selected>Select an Item</option>
                    ${variants.map(v => `<option value="${v.id}" data-price="${v.price.amount}" data-compare-price="${v.compareAtPrice?.amount || ''}" data-available="${v.availableForSale}" data-image="${v.image ? v.image.url : ''}">${v.title}</option>`).join('')}
                </select>
            </div>
        `;
    }

    const images = product.images.edges.map(edge => edge.node.url);
    const primaryImage = images.length > 0 ? images[0] : 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800';

    const thumbnailsHtml = images.length > 1 ? `
        <div class="product-thumbnails" style="display: flex; gap: 0.75rem; margin-top: 1rem; overflow-x: auto; padding-bottom: 0.5rem; flex-wrap: wrap;">
            ${images.map(img => `
                <img src="${img}" alt="Thumbnail" style="width: 70px; height: 70px; object-fit: contain; cursor: pointer; border: 1px solid var(--border); border-radius: 4px; padding: 4px; background: #fff;" onclick="window.swapMainImage('${img}')" class="thumbnail-img">
            `).join('')}
        </div>
    ` : '';

    const descHtmlRaw = product.descriptionHtml || '<p>Classic design.</p>';

    // Extract hidden embedded image sources natively to render at the bottom of the page
    const imgSrcRegex = /<img[^>]+src="([^">]+)"/gi;
    let match;
    const extractedImages = [];
    while ((match = imgSrcRegex.exec(descHtmlRaw)) !== null) {
        extractedImages.push(match[1]);
    }

    // Clean description text strictly for the sidebar meta
    const cleanDescHtml = descHtmlRaw.replace(/<img[^>]*>/gi, '').replace(/<b[^>]*>Product Image:<\/b>/gi, '').replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '<br>');

    const bottomImagesHtml = extractedImages.length > 0 ? `
        <div class="product-bottom-images" style="grid-column: 1 / -1; margin-top: 4rem; padding-top: 4rem; border-top: 1px solid var(--border);">
            <h2 style="font-family: var(--font-display); font-size: 2rem; margin-bottom: 2rem; text-align: center;">Item View Overview</h2>
            <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 1.25rem;">
                ${extractedImages.map(url => `<img src="${url}" alt="Product Detail" onclick="window.openLightbox('${url}')" style="width: 250px; height: 250px; object-fit: contain; border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; background: #fff; box-shadow: 0 5px 15px rgba(0,0,0,0.03); cursor: pointer; transition: transform 0.2s ease;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'" loading="lazy">`).join('')}
            </div>
        </div>
    ` : '';

    appRoot.innerHTML = `
        <div class="product-detail-container">
            <div class="interactive-gallery">
                <div class="main-image-container" style="width: 100%; aspect-ratio: 1/1; background: #f9f9f9; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid var(--border); border-radius: calc(var(--radius) * 2);">
                    <img id="main-product-image" src="${primaryImage}" alt="${product.title}" style="width: 90%; height: 90%; object-fit: contain; transition: opacity 0.3s ease; cursor: pointer;" onclick="window.openLightbox(this.src)">
                </div>
                ${thumbnailsHtml}
            </div>
            <div class="product-meta">
                <h1>${product.title}</h1>
                <p class="price" id="product-price-disp">${priceHtml}</p>
                
                <div class="add-to-cart-form" style="margin-bottom: 3rem; padding-bottom: 3rem; border-bottom: 1px solid var(--border);">
                    ${variantHtml}
                    <div class="qty-controls" style="margin-bottom: 1rem;">
                        <label for="qty-input" style="font-weight: 500; font-size: 0.85rem; margin-right: 0.5rem; align-self: center;">Quantity</label>
                        <input type="number" id="qty-input" class="quantity-input" value="1" min="1">
                    </div>
                    <button id="add-to-bag-trigger" class="btn btn-primary" style="width: 100%; margin-bottom: 0.5rem;" data-variant="${firstVariant?.id}" data-price="${price}" onclick="window.triggerAddToCart('${product.title.replace(/'/g, "\\'")}', '${primaryImage}')" ${!showVariants && !firstVariant?.availableForSale ? 'disabled' : ''} ${showVariants ? 'data-needs-variant="true"' : ''}>
                        ${showVariants ? 'Select an Item' : (firstVariant?.availableForSale ? 'Add To Bag' : 'Sold Out')}
                    </button>
                    <button id="buy-now-trigger" class="btn btn-outline" style="width: 100%; border-color:#000; color:#000;" data-variant="${firstVariant?.id}" onclick="window.triggerBuyNow()" ${!showVariants && !firstVariant?.availableForSale ? 'disabled' : ''} ${showVariants ? 'data-needs-variant="true"' : ''}>
                        Buy Now
                    </button>
                    
                    <div class="secure-payments" style="margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px dashed var(--border); text-align: center;">
                        <p style="font-size: 0.75rem; color: #555; margin-bottom: 0.5rem; font-weight: 500;">Guaranteed Safe & Secure Checkout</p>
                        <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center; flex-wrap: wrap;">
                            <span style="font-size:0.7rem; background:#f5f5f5; border:1px solid #e5e5e5; padding:0.25rem 0.5rem; border-radius:4px; color:#555; font-weight:700;">UPI</span>
                            <span style="font-size:0.7rem; background:#f5f5f5; border:1px solid #e5e5e5; padding:0.25rem 0.5rem; border-radius:4px; color:#555; font-weight:700;">PhonePe</span>
                            <span style="font-size:0.7rem; background:#f5f5f5; border:1px solid #e5e5e5; padding:0.25rem 0.5rem; border-radius:4px; color:#555; font-weight:700;">Netbanking</span>
                            <span style="font-size:0.7rem; background:#f5f5f5; border:1px solid #e5e5e5; padding:0.25rem 0.5rem; border-radius:4px; color:#555; display:flex; align-items:center; gap:0.25rem;">
                                <svg width="16" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2" ry="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
                                <span style="font-weight:700;">Cards</span>
                            </span>
                        </div>
                    </div>
                </div>

                <div class="product-description">
                    ${cleanDescHtml}
                </div>
            </div>
            
            ${bottomImagesHtml}
        </div>

        <!-- You May Also Like -->
        <section class="section container" id="recommended-products">
            <div class="section-header">
                <h2 class="section-title">You May Also Like</h2>
            </div>
            <div class="product-grid" id="recommended-grid">
                <div class="loader loader--dark" style="min-height:20vh;"><div class="loader-spinner"></div></div>
            </div>
        </section>
    `;

    // Load recommended products
    loadRecommendedProducts();
}

window.handleBuyNow = (variantId) => {
    const idParts = variantId.split('/');
    const rawId = idParts[idParts.length - 1];
    window.location.href = `https://${STORE_DOMAIN}/cart/${rawId}:1`;
};

async function loadRecommendedProducts() {
    try {
        const products = await getFeaturedProducts(4);
        const grid = document.getElementById('recommended-grid');
        if (!grid) return;
        if (products.length > 0) {
            grid.innerHTML = products.map(renderProductCard).join('');
        } else {
            grid.innerHTML = '<p class="empty-state">No recommendations found.</p>';
        }
    } catch (err) {
        console.error('Failed to load recommendations:', err);
    }
}

// --- Router ---
let isRouting = false;
async function router() {
    if (isRouting) return;
    isRouting = true;

    const hash = window.location.hash;
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));

    try {
        if (hash === '' || hash === '#/') {
            document.querySelector('.nav-link[href="#/"]')?.classList.add('active');
            await renderHome();
        } else if (hash === '#/shop') {
            document.querySelector('.nav-link[href="#/shop"]')?.classList.add('active');
            await renderShop();
        } else if (hash === '#/about') {
            document.querySelector('.nav-link[href="#/about"]')?.classList.add('active');
            await renderAbout();
        } else if (hash === '#/contact') {
            document.querySelector('.nav-link[href="#/contact"]')?.classList.add('active');
            await renderContact();
        } else if (hash.startsWith('#/category/')) {
            const cat = hash.split('#/category/')[1];
            await renderCategory(cat);
        } else if (hash.startsWith('#/product/')) {
            const handle = hash.split('#/product/')[1];
            await renderProductDetail(handle);
        } else {
            await renderHome();
        }
    } catch (e) {
        console.error("Router error:", e);
    }

    window.scrollTo({ top: 0, behavior: 'auto' });
    isRouting = false;
}

// --- About Page Components ---
async function renderAbout() {
    appRoot.innerHTML = `
        <div class="flywear-loader-screen is--loading is--hidden"></div> <!-- Placeholder for consistency -->
        
        <section class="hero hero--about" style="background: #f9f9f9; padding: 6rem 4%; text-align: center;">
            <div class="container--narrow" style="max-width: 800px; margin: 0 auto;">
                <span class="poster-tag" style="color: var(--sage); font-weight: 600; letter-spacing: 0.2em; display: block; margin-bottom: 1.5rem;">OUR STORY</span>
                <h1 style="font-family: var(--font-display); font-size: 3.5rem; margin-bottom: 2rem;">The Flywear Standard</h1>
                <p style="font-size: 1.1rem; line-height: 1.8; color: #555;">
                    Founded on the principle that premium quality shouldn't come with a luxury markup, Flywear was born to bridge the gap between high-end design and everyday accessibility.
                </p>
            </div>
        </section>

        <section class="section container">
            <div class="split-promo" style="padding: 0; min-height: 50vh;">
                <div class="promo-left" style="display: flex; align-items: stretch; padding: 2rem;">
                    <img src="assets/sitepage.png" alt="Flywear Lifestyle" style="width: 100%; height: 100%; object-fit: cover; border-radius: calc(var(--radius) * 3); box-shadow: 0 15px 40px rgba(0,0,0,0.06);">
                </div>
                <div class="promo-right" style="display: flex; align-items: center; padding: 3rem;">
                    <div>
                        <h2 style="font-family: var(--font-display); font-size: 2.2rem; margin-bottom: 1.5rem;">Curated Excellence</h2>
                        <p style="margin-bottom: 1.5rem; color: #666; font-size: 1rem; line-height: 1.7;">
                            Every piece in our collection is thoughtfully selected for its craftsmanship and durability. We believe your wardrobe should be an investment in confidence, not just clothing.
                        </p>
                        <p style="color: #666; font-size: 1rem; line-height: 1.7;">
                            Our direct-to-consumer model allows us to cut out middleman costs, delivering the best value for item and shipping directly to you.
                        </p>
                    </div>
                </div>
            </div>
        </section>

        <section class="section" style="background: #111; color: #fff; padding: 6rem 4%;">
            <div class="container">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 4rem; text-align: center;">
                    <div>
                        <h3 style="font-family: var(--font-display); font-size: 1.5rem; margin-bottom: 1rem;">15-20 Days Delivery</h3>
                        <p style="font-size: 0.9rem; color: rgba(255,255,255,0.6); line-height: 1.6;">
                            We optimize our logistics to provide you the best possible cost for both item and shipping. Good things take a little time to arrive perfectly.
                        </p>
                    </div>
                    <div>
                        <h3 style="font-family: var(--font-display); font-size: 1.5rem; margin-bottom: 1rem;">Quality Replacement</h3>
                        <p style="font-size: 0.9rem; color: rgba(255,255,255,0.6); line-height: 1.6;">
                            Your trust is our priority. Damaged products can be replaced with video proof, ensuring you always receive the perfection you paid for.
                        </p>
                    </div>
                    <div>
                        <h3 style="font-family: var(--font-display); font-size: 1.5rem; margin-bottom: 1rem;">Global Support</h3>
                        <p style="font-size: 0.9rem; color: rgba(255,255,255,0.6); line-height: 1.6;">
                            Our team is here to support your journey. Questions about sizing or shipping? We're just a message away.
                        </p>
                    </div>
                </div>
            </div>
        </section>

        <div style="text-align: center; padding: 6rem 0;">
            <a href="#/shop" class="btn btn-primary">Start Your Collection</a>
        </div>
    `;
}

// --- Contact Page Component ---
async function renderContact() {
    appRoot.innerHTML = `
        <div class="flywear-loader-screen is--loading is--hidden"></div>
        
        <section class="section container" style="padding-top: 6rem; padding-bottom: 6rem; max-width: 800px;">
            <div style="text-align: center; margin-bottom: 4rem;">
                <h1 style="font-family: var(--font-display); font-size: 3rem; margin-bottom: 1rem;">Get in Touch</h1>
                <p style="color: #666; font-size: 1.1rem; max-width: 600px; margin: 0 auto;">We'd love to hear from you. Reach out to us for any questions about your order, sizing, or our products.</p>
            </div>
            
            <div style="background: #fff; padding: 3rem; border-radius: calc(var(--radius) * 3); border: 1px solid var(--border); box-shadow: 0 10px 40px rgba(0,0,0,0.03); margin-bottom: 4rem;">
                <form id="contact-form" onsubmit="event.preventDefault(); alert('Message sent successfully! We will get back to you soon.'); this.reset();" style="display: flex; flex-direction: column; gap: 1.5rem;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;">
                        <div>
                            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: #111;">First Name</label>
                            <input type="text" required placeholder="John" style="width: 100%; padding: 0.8rem 1rem; border: 1px solid #ddd; border-radius: var(--radius); font-family: inherit; font-size: 0.95rem;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: #111;">Last Name</label>
                            <input type="text" required placeholder="Doe" style="width: 100%; padding: 0.8rem 1rem; border: 1px solid #ddd; border-radius: var(--radius); font-family: inherit; font-size: 0.95rem;">
                        </div>
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: #111;">Email Address</label>
                        <input type="email" required placeholder="john@example.com" style="width: 100%; padding: 0.8rem 1rem; border: 1px solid #ddd; border-radius: var(--radius); font-family: inherit; font-size: 0.95rem;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: #111;">Order Number (Optional)</label>
                        <input type="text" placeholder="#102934" style="width: 100%; padding: 0.8rem 1rem; border: 1px solid #ddd; border-radius: var(--radius); font-family: inherit; font-size: 0.95rem;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: #111;">Message</label>
                        <textarea required rows="5" placeholder="How can we help you?" style="width: 100%; padding: 0.8rem 1rem; border: 1px solid #ddd; border-radius: var(--radius); font-family: inherit; font-size: 0.95rem; resize: vertical;"></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary" style="align-self: flex-start; padding: 1rem 3rem; margin-top: 0.5rem;">Send Message</button>
                </form>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 2rem; text-align: center; padding-top: 3rem; border-top: 1px solid var(--border);">
                <div style="padding: 1rem;">
                    <div style="font-size: 1.75rem; margin-bottom: 1rem; color: #111;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                    </div>
                    <h4 style="font-weight: 600; margin-bottom: 0.5rem; font-family: var(--font-display);">Email Support</h4>
                    <a href="mailto:support@flywear.com" style="color: #666; text-decoration: none; font-size: 0.9rem;">support@flywear.com</a>
                    <p style="color: #999; font-size: 0.75rem; margin-top: 0.25rem;">Usually replies in 24 hours</p>
                </div>
                <div style="padding: 1rem;">
                    <div style="font-size: 1.75rem; margin-bottom: 1rem; color: #111;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    </div>
                    <h4 style="font-weight: 600; margin-bottom: 0.5rem; font-family: var(--font-display);">WhatsApp</h4>
                    <p style="color: #666; font-size: 0.9rem;">+91 98765 43210</p>
                    <p style="color: #999; font-size: 0.75rem; margin-top: 0.25rem;">Mon-Fri, 9AM-6PM IST</p>
                </div>
                <div style="padding: 1rem;">
                    <div style="font-size: 1.75rem; margin-bottom: 1rem; color: #111;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    </div>
                    <h4 style="font-weight: 600; margin-bottom: 0.5rem; font-family: var(--font-display);">Office Location</h4>
                    <p style="color: #666; font-size: 0.9rem;">Bangalore, India</p>
                    <p style="color: #999; font-size: 0.75rem; margin-top: 0.25rem;">HQ</p>
                </div>
            </div>
        </section>
    `;
}

// --- Search Functionality ---
const searchToggleBtn = document.getElementById('search-toggle');
const searchOverlay = document.getElementById('search-overlay');
const searchCloseBtn = document.getElementById('search-close');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const searchSpinner = document.getElementById('search-spinner');

let searchDebounceTimer = null;

function openSearch() {
    searchOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => searchInput.focus(), 300);
}

function closeSearch() {
    searchOverlay.classList.remove('active');
    document.body.style.overflow = '';
    searchInput.value = '';
    searchResults.innerHTML = '';
}

searchToggleBtn.addEventListener('click', openSearch);
searchCloseBtn.addEventListener('click', closeSearch);

// Close on clicking outside content
searchOverlay.addEventListener('click', (e) => {
    if (e.target === searchOverlay) closeSearch();
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchOverlay.classList.contains('active')) {
        closeSearch();
    }
});

async function searchProducts(term) {
    const query = `
        query searchProducts($query: String!) {
            products(first: 12, query: $query) {
                edges {
                    node {
                        id title handle vendor availableForSale
                        priceRange { minVariantPrice { amount currencyCode } }
                        compareAtPriceRange { maxVariantPrice { amount currencyCode } }
                        images(first: 1) { edges { node { url altText } } }
                    }
                }
            }
        }
    `;
    const data = await shopifyFetch(query, { query: term });
    return data?.products?.edges.map(e => e.node) || [];
}

function renderSearchResults(products) {
    if (products.length === 0) {
        searchResults.innerHTML = `
            <div class="search-empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <p>No products found. Try a different search term.</p>
            </div>
        `;
        return;
    }

    searchResults.innerHTML = products.map(product => {
        const image = product.images.edges[0]?.node?.url || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600';
        const price = product.priceRange.minVariantPrice.amount;
        const comparePrice = product.compareAtPriceRange?.maxVariantPrice?.amount;
        const isSale = comparePrice && parseFloat(comparePrice) > parseFloat(price);

        return `
            <div class="search-result-card" onclick="window.location.hash='#/product/${product.handle}'; closeSearch();">
                <div class="search-result-card__image">
                    <img src="${image}" alt="${product.title}" loading="lazy">
                </div>
                <div class="search-result-card__info">
                    <div class="search-result-card__title">${product.title}</div>
                    <div class="search-result-card__price">
                        ${isSale ? `<span class="compare-price" style="text-decoration: line-through; color: #999; margin-right: 0.5rem; font-size: 0.85em;">Rs. ${formatPrice(comparePrice)}</span>` : ''}
                        <span>Rs. ${formatPrice(price)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Make closeSearch available globally for inline onclick
window.closeSearch = closeSearch;

searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    const term = searchInput.value.trim();

    if (term.length === 0) {
        searchResults.innerHTML = '';
        searchSpinner.classList.remove('active');
        return;
    }

    if (term.length < 2) return;

    searchSpinner.classList.add('active');

    searchDebounceTimer = setTimeout(async () => {
        try {
            const products = await searchProducts(term);
            renderSearchResults(products);
        } catch (err) {
            console.error('Search error:', err);
            searchResults.innerHTML = '<div class="search-empty-state"><p>Something went wrong. Please try again.</p></div>';
        } finally {
            searchSpinner.classList.remove('active');
        }
    }, 400);
});

window.addEventListener('hashchange', router);
window.addEventListener('load', router);
