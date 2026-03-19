const int trigPin = 9;
const int echoPin = 10;

// Función para medir distancia con media
float medirDistancia() {
  float suma = 0;

  for (int i = 0; i < 5; i++) {

    // Generar pulso
    digitalWrite(trigPin, LOW);
    delayMicroseconds(2);

    digitalWrite(trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(trigPin, LOW);

    // Leer duración
    long duracion = pulseIn(echoPin, HIGH);

    // Convertir a distancia
    float distancia = duracion * 0.034 / 2;

    suma += distancia;

    delay(10); // pequeña pausa entre mediciones
  }

  return suma / 5;
}

void setup() {
  Serial.begin(9600);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
}

void loop() {
  float distancia = medirDistancia();

  // Filtrado básico 
  if (distancia > 2 && distancia < 400) {
    Serial.print("Distancia: ");
    Serial.print(distancia);
    Serial.println(" cm");
  }

  delay(500);
}