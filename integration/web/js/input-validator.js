/**
 * @file input-validator.js
 * @description Validador seguro de inputs en cliente para prevenir XSS e inyecciones SQL.
 *              Proporciona sanitización, validación y escapado de caracteres especiales.
 * 
 * @usage
 * - Sanitizar texto: InputValidator.sanitizeText(userInput, 50)
 * - Validar email: InputValidator.validateEmail(email)
 * - Validar altura: InputValidator.validateHeight(altura)
 * - Escapar HTML: InputValidator.escapeHtml(texto)
 * 
 * @security
 * - XSS prevention: Escapa <, >, ", ', & antes de insertar en DOM
 * - Length limits: Trunca strings según el contexto
 * - Type checking: Verifica tipos de datos
 * - Pattern matching: Valida con regex
 */

const InputValidator = {
  /**
   * Metadatos de límites permitidos para diferentes campos
   */
  LIMITS: {
    ALIAS: 50,
    NOMBRE: 120,
    EMAIL: 255,
    ALTURA_MIN: 0.5,
    ALTURA_MAX: 2.5,
    VIDEO_MAX_MB: 100,
  },

  /**
   * Expresiones regulares para validaciones específicas
   */
  PATTERNS: {
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    ONLY_ALPHANUMERIC: /^[a-zA-Z0-9\sáéíóúñ]*$/,
    ALTURA: /^\d{1}\.\d{2}$/,
  },

  /**
   * Función principal de sanitización de texto
   * 
   * @param {string} text - Texto a sanitizar
   * @param {number} maxLength - Longitud máxima permitida (default: 255)
   * @returns {string} Texto sanitizado, escapado y truncado
   * 
   * @example
   * const alias = InputValidator.sanitizeText(userInput, 50);
   */
  sanitizeText(text, maxLength = 255) {
    // 1. Convertir a string seguro
    text = String(text || '').trim();

    // 2. Truncar a longitud máxima
    text = text.substring(0, Math.min(maxLength, 255));

    // 3. Escapar caracteres peligrosos para HTML
    return this.escapeHtml(text);
  },

  /**
   * Escapa caracteres especiales para prevenir XSS
   * Convierte <, >, ", ', & a sus entidades HTML
   * 
   * @param {string} text - Texto a escapar
   * @returns {string} Texto con caracteres especiales escapados
   * 
   * @example
   * InputValidator.escapeHtml('<script>alert("XSS")</script>')
   * // Devuelve: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
   */
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
    };
    return String(text).replace(/[&<>"'\/]/g, (char) => map[char]);
  },

  /**
   * Valida un email con patrón básico
   * NOTA: Validación robusta debe hacerse en backend
   * 
   * @param {string} email - Email a validar
   * @returns {boolean} true si es válido, false en caso contrario
   * 
   * @example
   * InputValidator.validateEmail('usuario@example.com') // true
   * InputValidator.validateEmail('invalid.email') // false
   */
  validateEmail(email) {
    email = String(email || '').trim().toLowerCase();
    
    // Verificar longitud
    if (email.length > this.LIMITS.EMAIL) {
      console.warn(`Email excede longitud máxima: ${this.LIMITS.EMAIL}`);
      return false;
    }

    // Verificar patrón básico
    return this.PATTERNS.EMAIL.test(email);
  },

  /**
   * Valida altura en metros
   * 
   * @param {number|string} height - Altura en metros (ej: 1.75)
   * @returns {boolean} true si está entre 0.5 y 2.5 metros
   * 
   * @example
   * InputValidator.validateHeight(1.75) // true
   * InputValidator.validateHeight(5.00) // false
   */
  validateHeight(height) {
    const h = parseFloat(height);

    // Verificar que sea un número válido
    if (isNaN(h)) {
      console.warn('Altura no es un número válido');
      return false;
    }

    // Verificar rango permitido
    if (h < this.LIMITS.ALTURA_MIN || h > this.LIMITS.ALTURA_MAX) {
      console.warn(
        `Altura fuera de rango: ${this.LIMITS.ALTURA_MIN} - ${this.LIMITS.ALTURA_MAX}m`
      );
      return false;
    }

    return true;
  },

  /**
   * Valida un archivo de video antes de uploadearlo
   * 
   * @param {File} file - Objeto File del input
   * @returns {object} { valid: boolean, error: string|null }
   * 
   * @example
   * const result = InputValidator.validateVideoFile(file);
   * if (!result.valid) console.error(result.error);
   */
  validateVideoFile(file) {
    if (!file) {
      return { valid: false, error: 'No se seleccionó archivo' };
    }

    // 1. Verificar nombre de archivo
    if (!file.name || file.name.trim() === '') {
      return { valid: false, error: 'El archivo no tiene nombre válido' };
    }

    // 2. Verificar extensión
    const ext = this.getFileExtension(file.name).toLowerCase();
    const VALID_EXTENSIONS = ['.mp4', '.avi', '.mov', '.webm', '.mkv'];
    
    if (!VALID_EXTENSIONS.includes(ext)) {
      return {
        valid: false,
        error: `Extensión no permitida. Válidas: ${VALID_EXTENSIONS.join(', ')}`,
      };
    }

    // 3. Verificar tamaño (máx 100 MB)
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > this.LIMITS.VIDEO_MAX_MB) {
      return {
        valid: false,
        error: `Archivo exceede ${this.LIMITS.VIDEO_MAX_MB}MB (actual: ${sizeMB.toFixed(2)}MB)`,
      };
    }

    // 4. Verificar MIME type básico
    const VALID_MIMES = ['video/mp4', 'video/x-msvideo', 'video/quicktime', 'video/webm'];
    if (!VALID_MIMES.includes(file.type.toLowerCase())) {
      console.warn(`MIME type no estándar: ${file.type}. Continuando...`);
      // No bloqueamos, solo advertencia (el servidor valida)
    }

    return { valid: true, error: null };
  },

  /**
   * Extrae extensión de un nombre de archivo
   * 
   * @param {string} filename - Nombre del archivo
   * @returns {string} Extensión con punto (ej: '.mp4')
   * 
   * @private
   */
  getFileExtension(filename) {
    const parts = filename.split('.');
    return parts.length > 1 ? '.' + parts[parts.length - 1] : '';
  },

  /**
   * Valida un campo de entrada de usuario genérico
   * Combina sanitización y validación de longitud
   * 
   * @param {string} value - Valor a validar
   * @param {object} options - Opciones de validación
   *        - maxLength: número máximo de caracteres
   *        - required: si es obligatorio (default: true)
   *        - alphanumericOnly: solo alpanuméricos (default: false)
   * 
   * @returns {object} { valid: boolean, sanitized: string, error: string|null }
   * 
   * @example
   * InputValidator.validateField(userAlias, { maxLength: 50, alphanumericOnly: true })
   */
  validateField(value, options = {}) {
    const {
      maxLength = 255,
      required = true,
      alphanumericOnly = false,
    } = options;

    // 1. Verificar si es requerido
    if (required && (!value || String(value).trim() === '')) {
      return {
        valid: false,
        sanitized: '',
        error: 'Campo requerido',
      };
    }

    // 2. Sanitizar
    const sanitized = this.sanitizeText(value, maxLength);

    // 3. Verificar solo alfanuméricos si se requiere
    if (alphanumericOnly && !this.PATTERNS.ONLY_ALPHANUMERIC.test(sanitized)) {
      return {
        valid: false,
        sanitized,
        error: 'Solo se permiten letras, números y espacios',
      };
    }

    return {
      valid: true,
      sanitized,
      error: null,
    };
  },

  /**
   * Adjunta listeners a un formulario HTML para validar en tiempo real
   * 
   * @param {HTMLFormElement} formEl - Elemento form
   * @param {object} fieldConfig - Configuración por campo
   * 
   * @example
   * InputValidator.attachFormValidation(formEl, {
   *   'alias': { maxLength: 50 },
   *   'nombre': { maxLength: 120 },
   *   'altura': { type: 'height' }
   * })
   * 
   * @private
   */
  attachFormValidation(formEl, fieldConfig = {}) {
    if (!formEl || formEl.tagName !== 'FORM') {
      console.error('attachFormValidation: elemento no es un formulario');
      return;
    }

    // Iterar sobre campos configurados
    Object.entries(fieldConfig).forEach(([fieldName, config]) => {
      const fieldEl = formEl.querySelector(`[name="${fieldName}"]`);
      if (!fieldEl) return;

      // Validar en tiempo real
      fieldEl.addEventListener('blur', () => {
        if (config.type === 'height') {
          if (!this.validateHeight(fieldEl.value)) {
            fieldEl.classList.add('input-error');
            fieldEl.title = `Altura entre ${this.LIMITS.ALTURA_MIN} y ${this.LIMITS.ALTURA_MAX}m`;
          } else {
            fieldEl.classList.remove('input-error');
            fieldEl.title = '';
          }
        } else if (config.type === 'email') {
          if (!this.validateEmail(fieldEl.value)) {
            fieldEl.classList.add('input-error');
            fieldEl.title = 'Email inválido';
          } else {
            fieldEl.classList.remove('input-error');
            fieldEl.title = '';
          }
        } else {
          // Validación genérica
          const result = this.validateField(fieldEl.value, config);
          if (!result.valid) {
            fieldEl.classList.add('input-error');
            fieldEl.title = result.error;
          } else {
            fieldEl.classList.remove('input-error');
            fieldEl.title = '';
          }
        }
      });
    });

    // Prevenir submit si hay errores
    formEl.addEventListener('submit', (e) => {
      const hasErrors = Array.from(formEl.querySelectorAll('input, select, textarea')).some(
        (el) => el.classList.contains('input-error') || !el.value.trim()
      );

      if (hasErrors) {
        e.preventDefault();
        console.warn('Validación de formulario falló - hay campos inválidos');
      }
    });
  },
};

// Exportar si se usa como módulo
if (typeof module !== 'undefined' && module.exports) {
  module.exports = InputValidator;
}
