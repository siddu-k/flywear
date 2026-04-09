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
                images(first: 8) { edges { node { url altText } } }
                variants(first: 40) { edges { node { id title availableForSale price { amount currencyCode } image { url } } } }
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
    window.location.href = `https://${STORE_DOMAIN}/cart/${cartString}`;
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
    const image = product.images.edges[0]?.node?.url || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600';
    // If not available, show Sold out badge. Force some to show Sold out if mimicking the layout.
    const isAvailable = product.availableForSale !== undefined ? product.availableForSale : true;

    return `
        <div class="product-card" onclick="window.location.hash='#/product/${product.handle}'">
            <div class="product-image-wrap">
                <img src="${image}" alt="${product.title}" class="product-image" loading="lazy">
            </div>
            <div class="product-info">
                <h3 class="product-title">${product.title}</h3>
                <p class="product-price">Rs. ${formatPrice(price)}</p>
            </div>
        </div>
    `;
}

async function renderHome() {
    appRoot.innerHTML = '<div class="loader">Loading...</div>';

    const products = await getFeaturedProducts(4); // Match 4 items in image grid
    let productsHtml = products.length > 0 ? products.map(renderProductCard).join('') : '';

    appRoot.innerHTML = `
        <section class="hero" style="width: 100%; height: auto; min-height: unset; display: block; margin: 0; padding: 0;">
            <picture style="width: 100%; display: block; margin: 0; padding: 0;">
                <!-- The desktop banner -->
                <img src="assets/banner2.png" class="hero-bg" alt="Flywear Banner" style="width: 100%; height: auto; display: block; object-fit: contain;">
            </picture>
        </section>

        <!-- Our Products -->
        <section class="section container">
            <div class="section-header">
                <h2 class="section-title">Our Products</h2>
            </div>
            <div class="product-grid">
                ${productsHtml || '<p class="empty-state">No products found.</p>'}
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
                    <a href="#/contact" class="btn promo-brand-btn">About Us</a>
                </div>
            </div>
        </section>

        <!-- Shop By Collection Masonry -->
        <!-- Brand Poster Section -->
        <section class="brand-posters">
            <div class="poster-grid">
                <div class="poster-item poster-item--tall">
                    <img src="https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=800" alt="Style" loading="lazy">
                    <div class="poster-overlay">
                        <span class="poster-tag">Style</span>
                        <h3>Wear the<br>Difference</h3>
                    </div>
                </div>
                <div class="poster-item">
                    <img src="https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&q=80&w=800" alt="Comfort" loading="lazy">
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
    appRoot.innerHTML = '<div class="loader">Loading...</div>';

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
    appRoot.innerHTML = `<div class="loader">Loading...</div>`;

    const query = `
        query getProductsByQuery($query: String!) {
            products(first: 20, query: $query) {
                edges {
                    node {
                        id title handle vendor availableForSale 
                        priceRange { minVariantPrice { amount currencyCode } }
                        images(first: 1) { edges { node { url altText } } }
                    }
                }
            }
        }
    `;
    const data = await shopifyFetch(query, { query: categoryId });
    const products = data?.products?.edges.map(e => e.node) || [];

    let productsHtml = products.length > 0 ? products.map(renderProductCard).join('') : '<p class="empty-state">No items found.</p>';

    appRoot.innerHTML = `
        <div class="container section">
            <div class="section-header">
                <h1 class="section-title">${categoryId}</h1>
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
    const available = option.getAttribute('data-available') === 'true';
    const variantImg = option.getAttribute('data-image');

    document.getElementById('product-price-disp').innerText = 'Rs. ' + parseFloat(price).toFixed(2);

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
        buyBtn.disabled = false;
    } else {
        addBtn.innerText = 'Sold Out';
        addBtn.disabled = true;
        buyBtn.disabled = true;
    }
};

window.triggerAddToCart = (title, image) => {
    const btn = document.getElementById('add-to-bag-trigger');
    const overrideImage = btn.getAttribute('data-image') || image;
    addToCart(btn.getAttribute('data-variant'), title, btn.getAttribute('data-price'), overrideImage, parseInt(document.getElementById('qty-input').value) || 1);
};

window.triggerBuyNow = () => {
    const rawId = document.getElementById('buy-now-trigger').getAttribute('data-variant').split('/').pop();
    window.location.href = `https://${STORE_DOMAIN}/cart/${rawId}:${parseInt(document.getElementById('qty-input').value) || 1}`;
};

window.openLightbox = (url) => {
    document.getElementById('lightbox-img').src = url;
    document.getElementById('lightbox-overlay').classList.add('active');
};
window.closeLightbox = () => {
    document.getElementById('lightbox-overlay').classList.remove('active');
};

async function renderProductDetail(handle) {
    appRoot.innerHTML = '<div class="loader">Loading...</div>';

    const product = await getProductByHandle(handle);
    if (!product) {
        appRoot.innerHTML = '<div class="container section"><h2 class="section-title" style="text-align:center;">Product not found</h2></div>';
        return;
    }

    const firstVariant = product.variants.edges[0]?.node;
    const price = firstVariant?.price?.amount || product.priceRange.minVariantPrice.amount;

    const variants = product.variants.edges.map(e => e.node);
    const showVariants = variants.length > 1 && variants[0].title !== 'Default Title';

    let variantHtml = '';
    if (showVariants) {
        variantHtml = `
            <div class="variant-controls" style="margin-bottom: 1.5rem;">
                <label for="variant-select" style="font-weight: 500; font-size: 0.85rem; display: block; margin-bottom: 0.5rem;">Select Option</label>
                <select id="variant-select" onchange="window.updateVariantState(this)" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border); border-radius: 5px; font-family: var(--font-sans); background: #fff;">
                    <option value="" disabled selected>Select an Item</option>
                    ${variants.map(v => `<option value="${v.id}" data-price="${v.price.amount}" data-available="${v.availableForSale}" data-image="${v.image ? v.image.url : ''}">${v.title}</option>`).join('')}
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
                <p class="price" id="product-price-disp">Rs. ${formatPrice(price)}</p>
                
                <div class="add-to-cart-form" style="margin-bottom: 3rem; padding-bottom: 3rem; border-bottom: 1px solid var(--border);">
                    ${variantHtml}
                    <div class="qty-controls" style="margin-bottom: 1rem;">
                        <label for="qty-input" style="font-weight: 500; font-size: 0.85rem; margin-right: 0.5rem; align-self: center;">Quantity</label>
                        <input type="number" id="qty-input" class="quantity-input" value="1" min="1">
                    </div>
                    <button id="add-to-bag-trigger" class="btn btn-primary" style="width: 100%; margin-bottom: 0.5rem;" data-variant="${firstVariant?.id}" data-price="${price}" onclick="window.triggerAddToCart('${product.title.replace(/'/g, "\\'")}', '${primaryImage}')" ${showVariants || !firstVariant?.availableForSale ? 'disabled' : ''}>
                        ${showVariants ? 'Select an Item' : (firstVariant?.availableForSale ? 'Add To Bag' : 'Sold Out')}
                    </button>
                    <button id="buy-now-trigger" class="btn btn-outline" style="width: 100%; border-color:#000; color:#000;" data-variant="${firstVariant?.id}" onclick="window.triggerBuyNow()" ${showVariants || !firstVariant?.availableForSale ? 'disabled' : ''}>
                        Buy Now
                    </button>
                </div>

                <div class="product-description">
                    ${cleanDescHtml}
                </div>
            </div>
            
            ${bottomImagesHtml}
        </div>
    `;
}

window.handleBuyNow = (variantId) => {
    const idParts = variantId.split('/');
    const rawId = idParts[idParts.length - 1];
    window.location.href = `https://${STORE_DOMAIN}/cart/${rawId}:1`;
};

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

window.addEventListener('hashchange', router);
window.addEventListener('load', router);
