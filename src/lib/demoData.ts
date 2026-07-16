// Datos de ejemplo: candidatos y vacantes ficticios para poder enseñar
// Zalent sin usar CVs reales de nadie. Se cargan solo si el usuario lo pide
// explícitamente (botón en Ajustes) — nunca automáticamente.
//
// A propósito cubren sectores muy distintos (almacén, funeraria, sanidad,
// tecnología, hostelería, administración…) para que se note que Zalent es
// industria-agnóstica, no una herramienta pensada solo para IT.

import { saveCandidate } from "./candidates";
import { createVacancy, addCandidateToVacancy, setCandidateStage } from "./vacancies";
import { indexAllCandidates } from "./ai/search";

interface DemoCandidate {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  years_experience: number;
  education: string;
  skills: string[];
  languages: string[];
  raw_text: string;
}

const CANDIDATES: DemoCandidate[] = [
  {
    full_name: "Marta Fernández Ruiz",
    email: "marta.fernandez.ruiz@example.com",
    phone: "611 22 33 44",
    location: "Vigo",
    headline: "Mozo/a de almacén",
    years_experience: 4,
    education: "FP Grado Medio en Logística de Almacén",
    skills: ["Carretilla elevadora", "Picking", "SAP WMS", "Control de inventario", "PRL básico"],
    languages: ["Español", "Gallego"],
    raw_text:
      "Marta Fernández Ruiz. Vigo. marta.fernandez.ruiz@example.com. 611 22 33 44.\n\n" +
      "Experiencia\nMozo de almacén — Distribuciones Atlántico (2021-2025). Preparación de pedidos, " +
      "manejo de carretilla elevadora frontal y retráctil, control de stock con SAP WMS, recepción y " +
      "ubicación de mercancía.\nAuxiliar de almacén — Logifrío (2019-2021). Picking y empaquetado en " +
      "cámara de frío, etiquetado, carga y descarga de camiones.\n\n" +
      "Formación\nFP Grado Medio en Logística de Almacén, IES A Guarda (2019).\nCarné de carretillero " +
      "en vigor.\n\nIdiomas\nEspañol nativo. Gallego nativo.",
  },
  {
    full_name: "Iker Etxeberria Aguirre",
    email: "iker.etxeberria@example.com",
    phone: "622 33 44 55",
    location: "Bilbao",
    headline: "Responsable de almacén",
    years_experience: 9,
    education: "Grado en Organización Industrial",
    skills: ["Gestión de equipos", "Optimización de rutas", "SAP WMS", "Prevención de riesgos", "Carretilla elevadora"],
    languages: ["Español", "Euskera", "Inglés"],
    raw_text:
      "Iker Etxeberria Aguirre. Bilbao. iker.etxeberria@example.com. 622 33 44 55.\n\n" +
      "Experiencia\nResponsable de almacén — Transportes Norte (2018-2025). Coordinación de un equipo " +
      "de 12 personas, planificación de turnos, optimización de rutas de picking, negociación con " +
      "proveedores de transporte.\nJefe de turno — Mercadona (2016-2018). Supervisión de recepción y " +
      "reposición.\n\nFormación\nGrado en Organización Industrial, Universidad de Deusto (2016).\n\n" +
      "Idiomas\nEspañol nativo. Euskera nativo. Inglés intermedio (B2).",
  },
  {
    full_name: "Alba Domínguez Vega",
    email: "alba.dominguez@example.com",
    phone: "633 44 55 66",
    location: "Zaragoza",
    headline: "Auxiliar funerario",
    years_experience: 3,
    education: "Certificado de Profesionalidad en Servicios Funerarios",
    skills: ["Atención a familias", "Tanatopraxia básica", "Protocolo ceremonial", "Gestión documental"],
    languages: ["Español"],
    raw_text:
      "Alba Domínguez Vega. Zaragoza. alba.dominguez@example.com. 633 44 55 66.\n\n" +
      "Experiencia\nAuxiliar funeraria — Tanatorio San Miguel (2022-2025). Atención a familias en " +
      "momentos de duelo, preparación de salas, coordinación de ceremonias, gestión de documentación " +
      "con el registro civil.\nRecepcionista — Funeraria Ebro (2021-2022).\n\n" +
      "Formación\nCertificado de Profesionalidad en Servicios Funerarios (2021).\n\n" +
      "Idiomas\nEspañol nativo.",
  },
  {
    full_name: "Diego Molina Prats",
    email: "diego.molina.prats@example.com",
    phone: "644 55 66 77",
    location: "Valencia",
    headline: "Oficial de tanatopraxia",
    years_experience: 7,
    education: "Técnico Superior en Tanatopraxia",
    skills: ["Tanatopraxia", "Tanatoestética", "Normativa sanitaria mortuoria", "Coordinación de traslados"],
    languages: ["Español", "Inglés"],
    raw_text:
      "Diego Molina Prats. Valencia. diego.molina.prats@example.com. 644 55 66 77.\n\n" +
      "Experiencia\nOficial de tanatopraxia — Grupo Funerario Mediterráneo (2018-2025). Preparación y " +
      "conservación de cuerpos, tanatoestética, cumplimiento de normativa sanitaria, coordinación de " +
      "traslados nacionales e internacionales.\n\nFormación\nTécnico Superior en Tanatopraxia, Escuela " +
      "de Ciencias Funerarias de Valencia (2018).\n\nIdiomas\nEspañol nativo. Inglés básico (A2).",
  },
  {
    full_name: "Sofía Castillo Núñez",
    email: "sofia.castillo.nunez@example.com",
    phone: "655 66 77 88",
    location: "Madrid",
    headline: "Desarrolladora Frontend",
    years_experience: 5,
    education: "Grado en Ingeniería Informática",
    skills: ["React", "TypeScript", "CSS", "Testing", "Accesibilidad web"],
    languages: ["Español", "Inglés"],
    raw_text:
      "Sofía Castillo Núñez. Madrid. sofia.castillo.nunez@example.com. 655 66 77 88.\n\n" +
      "Experiencia\nDesarrolladora Frontend — Fintual Labs (2021-2025). Desarrollo de interfaces con " +
      "React y TypeScript, migración de un monolito a componentes reutilizables, mejora de la " +
      "accesibilidad web (WCAG 2.1), tests con Vitest y Testing Library.\nDesarrolladora junior — " +
      "Webnova (2019-2021). Maquetación y mantenimiento de sitios en WordPress y JavaScript.\n\n" +
      "Formación\nGrado en Ingeniería Informática, Universidad Complutense de Madrid (2019).\n\n" +
      "Idiomas\nEspañol nativo. Inglés avanzado (C1).",
  },
  {
    full_name: "Pablo Iglesias Botas",
    email: "pablo.iglesias.botas@example.com",
    phone: "666 77 88 99",
    location: "A Coruña",
    headline: "Desarrollador Backend",
    years_experience: 6,
    education: "Grado en Ingeniería Informática",
    skills: ["Node.js", "PostgreSQL", "Docker", "APIs REST", "AWS"],
    languages: ["Español", "Gallego", "Inglés"],
    raw_text:
      "Pablo Iglesias Botas. A Coruña. pablo.iglesias.botas@example.com. 666 77 88 99.\n\n" +
      "Experiencia\nDesarrollador Backend — Inditex Tech (2020-2025). Diseño de APIs REST en Node.js, " +
      "modelado de bases de datos PostgreSQL, despliegue en contenedores Docker sobre AWS, " +
      "monitorización y observabilidad.\nProgramador — Grupo R (2018-2020). Mantenimiento de sistemas " +
      "internos en PHP.\n\nFormación\nGrado en Ingeniería Informática, Universidade da Coruña (2018).\n\n" +
      "Idiomas\nEspañol nativo. Gallego nativo. Inglés intermedio (B2).",
  },
  {
    full_name: "Laura Gimeno Ferrer",
    email: "laura.gimeno.ferrer@example.com",
    phone: "677 88 99 00",
    location: "Barcelona",
    headline: "Enfermera geriátrica",
    years_experience: 8,
    education: "Grado en Enfermería + Especialidad Geriátrica",
    skills: ["Cuidados geriátricos", "Administración de medicación", "Historia clínica digital", "Primeros auxilios"],
    languages: ["Español", "Catalán", "Inglés"],
    raw_text:
      "Laura Gimeno Ferrer. Barcelona. laura.gimeno.ferrer@example.com. 677 88 99 00.\n\n" +
      "Experiencia\nEnfermera — Residencia Can Bruixa (2019-2025). Cuidados geriátricos, administración " +
      "de medicación, seguimiento de historia clínica digital, coordinación con familias y médicos.\n" +
      "Enfermera — Hospital de Sant Pau (2017-2019). Planta de medicina interna.\n\n" +
      "Formación\nGrado en Enfermería, Universitat de Barcelona (2016). Especialidad en Geriatría " +
      "(2017).\n\nIdiomas\nEspañol nativo. Catalán nativo. Inglés intermedio (B1).",
  },
  {
    full_name: "Rubén Casares López",
    email: "ruben.casares.lopez@example.com",
    phone: "688 99 00 11",
    location: "Sevilla",
    headline: "Técnico de mantenimiento industrial",
    years_experience: 10,
    education: "FP Grado Superior en Mecatrónica Industrial",
    skills: ["Mantenimiento preventivo", "Electricidad industrial", "Neumática", "Soldadura", "PRL"],
    languages: ["Español"],
    raw_text:
      "Rubén Casares López. Sevilla. ruben.casares.lopez@example.com. 688 99 00 11.\n\n" +
      "Experiencia\nTécnico de mantenimiento — Cervezas Cruzcampo (2015-2025). Mantenimiento preventivo " +
      "y correctivo de línea de embotellado, diagnóstico eléctrico y neumático, soldadura estructural.\n" +
      "Técnico — Talleres Betis (2013-2015).\n\nFormación\nFP Grado Superior en Mecatrónica Industrial, " +
      "IES Torreblanca (2013).\n\nIdiomas\nEspañol nativo.",
  },
  {
    full_name: "Carmen Rodríguez Ibáñez",
    email: "carmen.rodriguez.ibanez@example.com",
    phone: "699 00 11 22",
    location: "Málaga",
    headline: "Recepcionista de hotel",
    years_experience: 5,
    education: "Grado en Turismo",
    skills: ["Atención al cliente", "PMS hotelero (Opera)", "Gestión de reservas", "Resolución de incidencias"],
    languages: ["Español", "Inglés", "Alemán"],
    raw_text:
      "Carmen Rodríguez Ibáñez. Málaga. carmen.rodriguez.ibanez@example.com. 699 00 11 22.\n\n" +
      "Experiencia\nRecepcionista — Hotel Marbella Beach (2020-2025). Check-in/check-out, gestión de " +
      "reservas con Opera PMS, atención a huéspedes internacionales, resolución de incidencias.\n" +
      "Recepcionista — Hotel Costa del Sol (2018-2020).\n\nFormación\nGrado en Turismo, Universidad de " +
      "Málaga (2018).\n\nIdiomas\nEspañol nativo. Inglés avanzado (C1). Alemán intermedio (B1).",
  },
  {
    full_name: "Antonio Peña Salas",
    email: "antonio.pena.salas@example.com",
    phone: "610 11 22 33",
    location: "Murcia",
    headline: "Comercial de ventas",
    years_experience: 6,
    education: "Grado en Administración y Dirección de Empresas",
    skills: ["Negociación", "CRM (Salesforce)", "Prospección de clientes", "Gestión de cartera"],
    languages: ["Español", "Inglés"],
    raw_text:
      "Antonio Peña Salas. Murcia. antonio.pena.salas@example.com. 610 11 22 33.\n\n" +
      "Experiencia\nComercial — Suministros Industriales del Sureste (2019-2025). Gestión de cartera de " +
      "120 clientes, prospección activa, negociación de contratos, uso diario de Salesforce.\n" +
      "Comercial junior — Ofimática Murcia (2017-2019).\n\nFormación\nGrado en Administración y " +
      "Dirección de Empresas, Universidad de Murcia (2017).\n\nIdiomas\nEspañol nativo. Inglés " +
      "intermedio (B2).",
  },
  {
    full_name: "Nerea Otxoa Landa",
    email: "nerea.otxoa.landa@example.com",
    phone: "621 22 33 44",
    location: "San Sebastián",
    headline: "Responsable de marketing digital",
    years_experience: 7,
    education: "Grado en Publicidad y RRPP",
    skills: ["SEO/SEM", "Google Analytics", "Email marketing", "Redes sociales", "Gestión de equipos"],
    languages: ["Español", "Euskera", "Inglés"],
    raw_text:
      "Nerea Otxoa Landa. San Sebastián. nerea.otxoa.landa@example.com. 621 22 33 44.\n\n" +
      "Experiencia\nResponsable de marketing digital — Sidrería Grupo Gorriti (2020-2025). Estrategia " +
      "SEO/SEM, campañas de email marketing, gestión de un equipo de 3 personas, análisis con Google " +
      "Analytics.\nCommunity manager — Agencia Basque Digital (2018-2020).\n\nFormación\nGrado en " +
      "Publicidad y Relaciones Públicas, UPV/EHU (2018).\n\nIdiomas\nEspañol nativo. Euskera nativo. " +
      "Inglés intermedio (B2).",
  },
  {
    full_name: "Francisco Javier Ortega Mena",
    email: "fj.ortega.mena@example.com",
    phone: "632 33 44 55",
    location: "Alicante",
    headline: "Administrativo contable",
    years_experience: 12,
    education: "Grado en Contabilidad y Finanzas",
    skills: ["Contabilidad", "SAGE 50", "Facturación", "Conciliación bancaria", "Impuestos"],
    languages: ["Español"],
    raw_text:
      "Francisco Javier Ortega Mena. Alicante. fj.ortega.mena@example.com. 632 33 44 55.\n\n" +
      "Experiencia\nAdministrativo contable — Cerámicas Levante (2013-2025). Contabilidad general, " +
      "facturación, conciliación bancaria, presentación de impuestos trimestrales con SAGE 50.\n" +
      "Auxiliar administrativo — Gestoría Ortega (2011-2013).\n\nFormación\nGrado en Contabilidad y " +
      "Finanzas, Universidad de Alicante (2011).\n\nIdiomas\nEspañol nativo.",
  },
  {
    full_name: "Beatriz Salgado Freire",
    email: "beatriz.salgado.freire@example.com",
    phone: "643 44 55 66",
    location: "Lugo",
    headline: "Auxiliar de almacén",
    years_experience: 1,
    education: "Bachillerato",
    skills: ["Picking", "Embalaje", "Carné de conducir B"],
    languages: ["Español", "Gallego"],
    raw_text:
      "Beatriz Salgado Freire. Lugo. beatriz.salgado.freire@example.com. 643 44 55 66.\n\n" +
      "Experiencia\nAuxiliar de almacén — Coren Logística (2024-2025). Preparación de pedidos, " +
      "embalaje, etiquetado.\n\nFormación\nBachillerato, IES Lucus Augusti (2023).\n\nIdiomas\nEspañol " +
      "nativo. Gallego nativo.\n\nOtros\nCarné de conducir B.",
  },
  {
    full_name: "Hugo Ferreiro Blanco",
    email: "hugo.ferreiro.blanco@example.com",
    phone: "654 55 66 77",
    location: "Pontevedra",
    headline: "Conductor de carretilla elevadora",
    years_experience: 15,
    education: "Educación Secundaria Obligatoria",
    skills: ["Carretilla elevadora", "Transpaleta eléctrica", "Carga y descarga", "ADR básico"],
    languages: ["Español", "Gallego"],
    raw_text:
      "Hugo Ferreiro Blanco. Pontevedra. hugo.ferreiro.blanco@example.com. 654 55 66 77.\n\n" +
      "Experiencia\nConductor de carretilla elevadora — Frigoríficos Rande (2010-2025). Carga y " +
      "descarga de camiones, manejo de carretilla frontal y transpaleta eléctrica, certificado ADR " +
      "básico para mercancías refrigeradas.\n\nFormación\nEducación Secundaria Obligatoria (2009). " +
      "Carné de carretillero en vigor.\n\nIdiomas\nEspañol nativo. Gallego nativo.",
  },
];

// (título, sector aproximado por si se quiere filtrar en el futuro)
const VACANCIES: { title: string; description: string }[] = [
  {
    title: "Mozo/a de almacén — turno de mañana",
    description:
      "Buscamos mozo/a de almacén para centro logístico. Imprescindible carné de carretillero en vigor. " +
      "Se valorará experiencia con SAP WMS. Turno de mañana, incorporación inmediata.",
  },
  {
    title: "Auxiliar funerario/a",
    description:
      "Tanatorio busca auxiliar funerario/a para atención a familias y apoyo en ceremonias. Se valora " +
      "formación específica en servicios funerarios y disponibilidad para guardias.",
  },
  {
    title: "Desarrollador/a Frontend React",
    description:
      "Startup fintech busca desarrollador/a frontend con experiencia en React y TypeScript para unirse " +
      "a un equipo de producto. Valorable experiencia en accesibilidad web.",
  },
];

export interface DemoLoadResult {
  candidates: number;
  vacancies: number;
}

// Carga los datos de ejemplo: candidatos + un par de vacantes con el
// pipeline ya poblado, e indexa los candidatos para que la búsqueda
// semántica funcione sobre ellos desde el primer momento.
export async function loadDemoData(): Promise<DemoLoadResult> {
  const ids: number[] = [];
  for (const c of CANDIDATES) {
    const id = await saveCandidate({
      full_name: c.full_name,
      email: c.email,
      phone: c.phone,
      location: c.location,
      headline: c.headline,
      years_experience: c.years_experience,
      education: c.education,
      links: "",
      raw_text: c.raw_text,
      source_file: `${c.full_name}.pdf`,
      file_path: null,
      skills: c.skills,
      languages: c.languages,
    });
    ids.push(id);
  }

  // Vacante 0 (almacén): candidatos 0, 1, 12, 13 (perfiles de almacén).
  // Vacante 1 (funeraria): candidatos 2, 3.
  // Vacante 2 (frontend): candidatos 4, 5 (aunque 5 es backend, sirve para
  // ver cómo el matching señala el hueco de encaje).
  const vacancyId0 = await createVacancy(VACANCIES[0].title, VACANCIES[0].description);
  const vacancyId1 = await createVacancy(VACANCIES[1].title, VACANCIES[1].description);
  const vacancyId2 = await createVacancy(VACANCIES[2].title, VACANCIES[2].description);

  const assign = async (
    vacancyId: number,
    candidateIndex: number,
    stage: string,
  ) => {
    await addCandidateToVacancy(ids[candidateIndex], vacancyId);
    await setCandidateStage(ids[candidateIndex], vacancyId, stage);
  };

  await assign(vacancyId0, 0, "entrevista");
  await assign(vacancyId0, 1, "oferta");
  await assign(vacancyId0, 12, "nuevo");
  await assign(vacancyId0, 13, "descartado");

  await assign(vacancyId1, 2, "entrevista");
  await assign(vacancyId1, 3, "nuevo");

  await assign(vacancyId2, 4, "oferta");
  await assign(vacancyId2, 5, "nuevo");

  // Sin esto, la búsqueda semántica no tendría vectores para estos
  // candidatos hasta el primer "search()" — mejor dejarlo listo ya.
  await indexAllCandidates();

  return { candidates: ids.length, vacancies: 3 };
}
