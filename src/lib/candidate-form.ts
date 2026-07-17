// El formulario de una ficha de candidato (todos los campos como STRING porque
// alimentan directamente inputs de texto que el recruiter edita). Compartido
// por la importación (revisar antes de guardar) y la edición en la ficha.

export interface CandidateForm {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  years_experience: string;
  education: string;
  links: string;
  skills: string;
  languages: string;
}

export const emptyForm: CandidateForm = {
  full_name: "", email: "", phone: "", location: "", headline: "",
  years_experience: "", education: "", links: "", skills: "", languages: "",
};

// "Python, SQL,  Docker" → ["Python", "SQL", "Docker"] (sin vacíos ni espacios).
export function splitList(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}
