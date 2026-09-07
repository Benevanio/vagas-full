import { render } from "@react-email/render";
import * as React from "react";
import { AppError } from "../../../lib/errors";
import {
  EmailChangeConfirmation,
  EmailChangeConfirmationProps,
} from "./emailChangeConfirmation";
import { Welcome, WelcomeProps } from "./welcome";

/**
 * Mapa de templates disponíveis. Cada entrada define o subject fixo e o
 * componente react-email usado para gerar o HTML.
 */
const templates = {
  welcome: {
    subject: "Bem-vindo ao Candidate",
    component: Welcome,
  },
  emailChangeConfirmation: {
    subject: "Confirme seu novo e-mail no Candidate",
    component: EmailChangeConfirmation,
  },
} satisfies Record<
  string,
  { subject: string; component: (props: never) => React.ReactElement }
>;

export type TemplateName = keyof typeof templates;

/**
 * Dados aceitos por cada template (props do componente).
 */
export interface TemplateDataMap {
  welcome: WelcomeProps;
  emailChangeConfirmation: EmailChangeConfirmationProps;
}

export function isTemplate(name: string): name is TemplateName {
  return Object.prototype.hasOwnProperty.call(templates, name);
}

/**
 * Renderiza o template indicado em HTML. Lança `AppError.validation` quando o
 * template não existe (EMAIL-05). O render do react-email é assíncrono.
 */
export async function renderTemplate<T extends TemplateName>(
  name: T,
  data: TemplateDataMap[T],
): Promise<{ subject: string; html: string }> {
  if (!isTemplate(name)) {
    throw AppError.validation(`Template de e-mail desconhecido: ${name}`);
  }

  const entry = templates[name];
  const element = React.createElement(
    entry.component as (props: TemplateDataMap[T]) => React.ReactElement,
    data,
  );
  const html = await render(element);

  return { subject: entry.subject, html };
}
