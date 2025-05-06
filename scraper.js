const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
// Usa el puerto proporcionado por Railway o 3000 como fallback
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Servir HTML en la ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta para consultar CURP
app.post('/scrape', async (req, res) => {
  const { curp } = req.body;
  
  if (!curp) {
    return res.status(400).json({ error: 'Se requiere el CURP' });
  }
  
  try {
    console.log(`Iniciando consulta para CURP: ${curp}`);
    
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: "new"
    });
    
    const page = await browser.newPage();
    
    // Configurar timeout más largo y navegación
    await page.setDefaultNavigationTimeout(30000);
    await page.setDefaultTimeout(30000);
    
    console.log('Navegando a la página de CURP...');
    await page.goto('https://www.gob.mx/curp/', { waitUntil: 'networkidle2' });
    
    console.log('Ingresando CURP...');
    await page.type('#curpinput', curp);
    await page.click('#searchButton');
    
    // Esperar a que los resultados aparezcan
    console.log('Esperando resultados...');
    await page.waitForSelector('.panel-body', { timeout: 15000 });
    
    console.log('Extrayendo datos...');
    const data = await page.evaluate(() => {
      const curpData = {};
      const fields = [
        'CURP:', 'Nombre(s):', 'Primer apellido:', 'Segundo apellido:',
        'Sexo:', 'Fecha de nacimiento:', 'Nacionalidad:',
        'Entidad de nacimiento:', 'Documento probatorio:'
      ];
      
      try {
        fields.forEach((field, index) => {
          const selector = `.panel-body tr:nth-child(${index + 1}) td:nth-child(2)`;
          const element = document.querySelector(selector);
          
          if (element) {
            curpData[field.trim()] = element.innerText.trim();
          } else {
            curpData[field.trim()] = 'No disponible';
          }
        });
      } catch (err) {
        console.error('Error en la extracción de datos:', err);
      }
      
      return curpData;
    });
    
    await browser.close();
    console.log('Consulta completada con éxito');
    res.json(data);
    
  } catch (error) {
    console.error('Error en la consulta de CURP:', error);
    res.status(500).json({ 
      error: 'Error al obtener los datos de CURP',
      message: error.message
    });
  }
});

// Ruta para calcular RFC
app.post('/calculate-rfc', async (req, res) => {
  const { nombre, primerApellido, segundoApellido, dia, mes, anio } = req.body;
  
  // Validar que todos los campos necesarios estén presentes
  if (!nombre || !primerApellido || !dia || !mes || !anio) {
    return res.status(400).json({ 
      error: 'Faltan datos requeridos para calcular el RFC'
    });
  }
  
  try {
    console.log('Iniciando cálculo de RFC...');
    console.log(`Datos: ${nombre} ${primerApellido} ${segundoApellido}, ${dia}/${mes}/${anio}`);
    
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: "new"
    });
    
    const page = await browser.newPage();
    
    // Configurar timeout más largo
    await page.setDefaultNavigationTimeout(30000);
    await page.setDefaultTimeout(30000);
    
    // Habilitar eventos de consola para depuración
    page.on('console', msg => console.log('PÁGINA:', msg.text()));
    
    console.log('Navegando a la página de cálculo de RFC...');
    await page.goto('https://consisa.com.mx/rfc', { waitUntil: 'networkidle2' });
    
    // Esperar a que el formulario esté disponible
    console.log('Esperando formulario...');
    await page.waitForSelector('#strNombre', { timeout: 10000 });
    
    console.log('Completando formulario...');
    await page.type('#strNombre', nombre);
    await page.type('#strPrimerApellido', primerApellido);
    
    if (segundoApellido) {
      await page.type('#strSegundoApellido', segundoApellido);
    }
    
    // Seleccionar día, mes y año
    await page.select('#strdia', dia);
    await page.select('#strmes', mes);
    await page.select('#stranio', anio);
    
    // Hacer clic en el botón de cálculo
    console.log('Enviando formulario...');
    await page.click('.ui.primary.button');
    
    // Esperar resultados
    console.log('Esperando resultados...');
    await page.waitForSelector('.ui.striped.table', { timeout: 15000 });
    
    // Extraer resultados
    console.log('Extrayendo resultados...');
    const result = await page.evaluate(() => {
      const resultData = {};
      
      try {
        const rows = document.querySelectorAll('.ui.striped.table tbody tr');
        
        if (rows.length === 0) {
          return { error: 'No se encontraron resultados' };
        }
        
        rows.forEach(row => {
          const keyElement = row.querySelector('td');
          const valueElement = row.querySelector('td:nth-child(2)');
          
          if (keyElement && valueElement) {
            const key = keyElement.innerText.trim();
            const value = valueElement.innerText.trim();
            resultData[key] = value;
          }
        });
      } catch (err) {
        console.error('Error en la extracción de datos:', err);
        return { error: 'Error al extraer datos de la tabla' };
      }
      
      return resultData;
    });
    
    await browser.close();
    console.log('Cálculo de RFC completado');
    res.json(result);
    
  } catch (error) {
    console.error('Error en el cálculo del RFC:', error);
    res.status(500).json({ 
      error: 'Error al calcular el RFC', 
      message: error.message 
    });
  }
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});