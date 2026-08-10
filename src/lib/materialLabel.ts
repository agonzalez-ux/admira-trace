import { TIPO_MATERIAL_LABELS } from "./constants";

/**
 * Etiqueta legible del tipo de material. Para el tipo "OTRO" se muestra lo que
 * escribió quien lo dio de alta, en vez del genérico "Otro".
 */
export function etiquetaTipo(material: { tipo: string; tipoPersonalizado?: string | null }): string {
  if (material.tipo === "OTRO" && material.tipoPersonalizado) {
    return material.tipoPersonalizado;
  }
  return TIPO_MATERIAL_LABELS[material.tipo as keyof typeof TIPO_MATERIAL_LABELS] || material.tipo;
}
