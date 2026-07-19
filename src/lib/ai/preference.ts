// Aprender de ti: los votos 👍/👎 reordenan los resultados.
//
// El cálculo (algoritmo de Rocchio: la dirección media de los perfiles que te
// gustan MENOS la de los que rechazas) vivía aquí, pero necesita los vectores
// de todos los candidatos — y los vectores ya no cruzan a la interfaz. Se
// movió a Rust, junto al resto de la aritmética vectorial: ver
// `preference_boosts()` en `src-tauri/src/lib.rs` y el Diario, entrada 45.
//
// Lo que queda aquí es la decisión de PRODUCTO, no la matemática: cuánto
// mandan tus votos frente al encaje real de la búsqueda. Vive en TypeScript
// a propósito, con el resto de constantes de puntuación, porque es un valor
// que se ajusta probando la app, no optimizando el cálculo.

// Peso del empujón por preferencia (suave: reordena sin falsear el %).
export const PREF_WEIGHT = 0.12;
