export interface Participant {
  id: string;
  type: string;
  name: string;
  items: any[];
  total: number;
  isSubmitted: boolean;
}