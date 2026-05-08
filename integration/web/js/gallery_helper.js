/* gallery_helper.js
   Utilidades compartidas para las galerías de vídeo.
   Provee helpers para poblar selects de usuarios, debounce y setEstado.

   Uso:
     GalleryHelper.fetchAndPopulateUsers({
       url: 'https://.../api/usuarios',
       selectId: 'filtro-usuario',
       isPaginated: false, // o true si la API usa paginado
       pageSize: 100, // solo para paginado
       transformItem: (item) => ({ value: String(item.id_usuario), text: `${item.alias} (ID ${item.id_usuario})` }),
       fetchFn: fetchJson // función que realiza fetch y devuelve JSON
     });

   Está diseñado para integrarse con los scripts existentes sin módulo ES.
*/
(function (global) {
  const GalleryHelper = {
    addTodosOption(select, text = 'Todos los usuarios') {
      const optionTodos = document.createElement('option');
      optionTodos.value = '';
      optionTodos.textContent = text;
      select.appendChild(optionTodos);
    },

    setEstado(elementId, texto, esError = false) {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.textContent = texto;
      el.style.color = esError ? '#ff6b6b' : '';
    },

    debounce(fn, wait = 300) {
      let t = null;
      return function debounced(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
      };
    },

    async fetchAndPopulateUsers(options) {
      const {
        url,
        selectId,
        isPaginated = false,
        pageSize = 100,
        transformItem = (i) => ({ value: String(i.id_usuario), text: `${i.alias || i.nombre || 'Usuario'} (ID ${i.id_usuario})` }),
        fetchFn = (u) => fetch(u).then((r) => r.json()),
      } = options;

      const select = document.getElementById(selectId);
      if (!select) return [];

      select.innerHTML = '';
      GalleryHelper.addTodosOption(select);

      const items = [];

      if (!isPaginated) {
        const payload = await fetchFn(url);
        const list = Array.isArray(payload) ? payload : (payload.items || payload.usuarios || []);
        items.push(...list);
      } else {
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
          const params = new URLSearchParams({ paginado: '1', limit: String(pageSize), offset: String(offset) });
          const pageUrl = url.includes('?') ? `${url}&${params.toString()}` : `${url}?${params.toString()}`;
          const payload = await fetchFn(pageUrl);
          const pageItems = Array.isArray(payload) ? payload : (payload.usuarios || payload.items || []);
          items.push(...pageItems);
          hasMore = Boolean(payload?.has_more);
          if (!hasMore && Array.isArray(payload)) {
            hasMore = pageItems.length === pageSize;
          }
          offset += pageSize;
          if (!pageItems.length) break;
        }
      }

      items
        .sort((a, b) => String((a.alias || a.nombre || '')).localeCompare(String((b.alias || b.nombre || ''))))
        .forEach((it) => {
          try {
            const optData = transformItem(it);
            const opt = document.createElement('option');
            opt.value = optData.value;
            opt.textContent = optData.text;
            select.appendChild(opt);
          } catch (err) {
            // ignorar elementos mal formados
          }
        });

      return items;
    },
  };

  global.GalleryHelper = GalleryHelper;
})(window);

/* CacheManager
   Caché simple con TTL para reducir llamadas al backend.
   Evita refetch de usuarios y vídeos dentro de 5 minutos.
   Uso: CacheManager.set(url, data); const cached = CacheManager.get(url);
*/
(function (global) {
  const cacheStore = {};
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutos en ms

  const CacheManager = {
    generateKey(url, params = {}) {
      const paramStr = Object.entries(params).sort().map(([k, v]) => `${k}=${v}`).join('&');
      return `${url}|${paramStr}`;
    },

    set(url, data, params = {}) {
      const key = this.generateKey(url, params);
      cacheStore[key] = { data, timestamp: Date.now() };
    },

    get(url, params = {}) {
      const key = this.generateKey(url, params);
      const entry = cacheStore[key];
      if (!entry) return null;
      if (Date.now() - entry.timestamp > CACHE_TTL) {
        delete cacheStore[key];
        return null;
      }
      return entry.data;
    },

    clear() {
      Object.keys(cacheStore).forEach((key) => { delete cacheStore[key]; });
    },
  };

  global.CacheManager = CacheManager;
})(window);

/* LazyLoadHelper
   Usa Intersection Observer para cargar imágenes/vídeos solo cuando son visibles.
   Reduce consumo de memoria y ancho de banda en listas largas.
   Uso: LazyLoadHelper.observeElements('video.video-player', 'data-src');
*/
(function (global) {
  const LazyLoadHelper = {
    observeElement(element, dataSrcAttr = 'data-src') {
      if (!('IntersectionObserver' in window)) {
        element.src = element.getAttribute(dataSrcAttr);
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const src = entry.target.getAttribute(dataSrcAttr);
              if (src) {
                entry.target.src = src;
                entry.target.removeAttribute(dataSrcAttr);
              }
              observer.unobserve(entry.target);
            }
          });
        },
        { rootMargin: '50px' }
      );

      observer.observe(element);
    },

    observeElements(selector, dataSrcAttr = 'data-src') {
      document.querySelectorAll(selector).forEach((el) => {
        this.observeElement(el, dataSrcAttr);
      });
    },
  };

  global.LazyLoadHelper = LazyLoadHelper;
})(window);
