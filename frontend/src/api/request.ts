import { apiCall } from "./client";

export interface RequestRow {
  name: string;
  subject: string;
  status: "Open" | "Completed" | "Rejected";
  current_holder: string | null;
  holder_name: string | null;
  requested_by: string;
  employee_name: string | null;
  modified: string;
}

export interface RequestStep {
  time: string;
  action: "Created" | "Forwarded" | "Completed" | "Rejected";
  from_name: string | null;
  to_name: string | null;
  comment: string | null;
}

export interface RequestDetail {
  name: string;
  subject: string;
  details: string | null;
  status: RequestRow["status"];
  requested_by_name: string | null;
  holder_name: string | null;
  creation: string;
  completed_on: string | null;
  can_act: boolean;
  trail: RequestStep[];
}

export interface Person {
  name: string;
  employee_name: string;
  designation: string | null;
  department: string | null;
}

export const requestApi = {
  enabled: () => apiCall<boolean>("GET", "fatehhr.api.request.enabled"),
  mine: () => apiCall<{ raised: RequestRow[]; waiting: RequestRow[] }>("GET", "fatehhr.api.request.mine"),
  create: (subject: string, details: string) =>
    apiCall<{ name: string }>("POST", "fatehhr.api.request.create", { subject, details }),
  detail: (name: string) => apiCall<RequestDetail>("POST", "fatehhr.api.request.detail", { name }),
  forward: (name: string, to_employee: string, comment: string) =>
    apiCall("POST", "fatehhr.api.request.forward", { name, to_employee, comment }),
  complete: (name: string, comment: string) => apiCall("POST", "fatehhr.api.request.complete", { name, comment }),
  reject: (name: string, comment: string) => apiCall("POST", "fatehhr.api.request.reject", { name, comment }),
  people: (txt: string) => apiCall<Person[]>("POST", "fatehhr.api.request.people", { txt }),
};
