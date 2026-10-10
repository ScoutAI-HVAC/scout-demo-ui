import type { Lead, Message, Source, Stage } from "./model";
type Example = {
  name: string;
  source: Source;
  stage: Stage;
  service: string;
  area: string;
  hours: number;
  value: number;
  tags: string[];
  lines: string[];
};
const EXAMPLES: Example[] = [
  {
    name: "Alex Morgan",
    source: "google_lsa",
    stage: "booked",
    service: "Service request",
    area: "North Park",
    hours: 4,
    value: 28900,
    tags: ["Same day", "Booked LSA"],
    lines: [
      "Hi, we need help with a repair at our home. Can someone come today?",
      "Hi Alex! Scout here. What do you need help with, and what neighborhood are you in?",
      "A fixture needs attention. We're in North Park.",
      "Got it. We have a visit available today, 2–4 PM. Would that work for you?",
      "Yes please! It's 124 Example Lane. Do I need to do anything before they arrive?",
      "You're booked for today, 2–4 PM. I have added your request to the visit notes. Your technician will text before heading over.",
      "Perfect, thank you for getting back so quickly!",
    ],
  },
  {
    name: "Jordan Ellis",
    source: "meta",
    stage: "unbooked",
    service: "Project estimate",
    area: "Hillcrest",
    hours: 5,
    value: 0,
    tags: ["Estimate on call", "Follow up"],
    lines: [
      "I'm interested in the services from your ad. We have a project in mind.",
      "Hi Jordan! Happy to help. What work are you considering?",
      "We have a few repairs and improvements to discuss.",
      "A visit would let the team review the work with you. Is a morning or afternoon usually easier?",
      "Afternoons. Let me check with my partner about Thursday.",
      "Of course. Send me a time that works for both of you and I'll check the schedule.",
    ],
  },
  {
    name: "Taylor Brooks",
    source: "thumbtack",
    stage: "booked",
    service: "Garage project",
    area: "South Park",
    hours: 8,
    value: 680000,
    tags: ["Estimate on call", "Recaptured"],
    lines: [
      "We need help with a garage office project. About 400 square feet.",
      "What work do you have in mind? Is the garage attached to the house?",
      "Attached, yes. We insulated it last year. I had asked a few weeks ago but got busy.",
      "No problem, we can pick up right here. An installer can look at placement and electrical access Friday, 10 AM–noon. Want that window?",
      "Friday works. Thank you for following up.",
      "All set for Friday, 10 AM–noon. I've noted this is your garage office so the team comes prepared.",
    ],
  },
  {
    name: "Casey Rivera",
    source: "angi",
    stage: "booked",
    service: "Repair visit",
    area: "University Heights",
    hours: 12,
    value: 42500,
    tags: ["Next day"],
    lines: [
      "Something at our property needs repairing. Could someone take a look?",
      "Hi Casey, let's get a technician to take a look. Are you noticing any unusual smells or sounds?",
      "No smells, just the fan starting and stopping.",
      "Thanks. I can offer tomorrow, 8–10 AM. Does that work?",
      "Yes, I'll be home.",
      "You're booked for tomorrow, 8–10 AM. The technician will check in before arriving.",
    ],
  },
  {
    name: "Riley Parker",
    source: "google_lsa",
    stage: "booked",
    service: "Replacement estimate",
    area: "Kensington",
    hours: 26,
    value: 940000,
    tags: ["Booked LSA", "Estimate on call"],
    lines: [
      "We have some replacement work in mind. Can we get an estimate?",
      "Absolutely, Riley. What would you like replaced, and where is the property?",
      "Around 20 years old. Single story, 1,800 square feet.",
      "Thanks, that's helpful. We can arrange an in-home assessment Wednesday, 1–3 PM. Would you like that?",
      "Yes, that works.",
      "Your assessment is booked. We'll review your comfort needs and installation options together.",
    ],
  },
  {
    name: "Avery Chen",
    source: "meta",
    stage: "booked",
    service: "Property service",
    area: "Normal Heights",
    hours: 30,
    value: 185000,
    tags: ["Booked Meta", "Property service"],
    lines: [
      "Saw your ad about property services. We have a few repairs in mind.",
      "Hi Avery! What would you like the team to look at?",
      "There are a few areas that need attention. I can show the technician.",
      "A technician can look at the work and explain suitable options. Would Tuesday, 9–11 AM work?",
      "Yes please.",
      "You're on the schedule for Tuesday, 9–11 AM. I've added your requests to the visit notes.",
    ],
  },
  {
    name: "Sam Bennett",
    source: "thumbtack",
    stage: "unbooked",
    service: "Routine maintenance",
    area: "Mission Hills",
    hours: 45,
    value: 0,
    tags: ["Callback", "Needs review"],
    lines: [
      "Looking for routine maintenance at our rental property.",
      "Hi Sam! What work do you need, and will someone be there to let the technician in?",
      "Same address. I need to coordinate with the tenants. Could someone call me?",
      "Absolutely. I've flagged your request for the office so they can help coordinate access and the visit.",
    ],
  },
  {
    name: "Drew Campbell",
    source: "google_lsa",
    stage: "excused",
    service: "Commercial service",
    area: "Outside service area",
    hours: 53,
    value: 0,
    tags: ["Outside service area"],
    lines: [
      "Do you visit commercial properties about two hours north of the city?",
      "Thanks for checking, Drew. That location is outside our current service area, so I don't want to promise a visit we can't make.",
      "Understood. Thanks for letting me know.",
      "You're welcome. I hope you're able to find a local team who can get it sorted quickly.",
    ],
  },
  {
    name: "Jamie Foster",
    source: "meta",
    stage: "not_delivered",
    service: "Installation request",
    area: "Golden Hill",
    hours: 72,
    value: 0,
    tags: ["Delivery issue"],
    lines: [
      "I'd like help with an installation.",
      "Hi Jamie! Scout here. What would you like installed, and where is the property?",
    ],
  },
  {
    name: "Quinn Davis",
    source: "yelp",
    stage: "booked",
    service: "Property repair",
    area: "Bankers Hill",
    hours: 96,
    value: 125000,
    tags: ["Recaptured", "Follow up"],
    lines: [
      "There is a problem in one bedroom. Could someone inspect it?",
      "What have you noticed? I can share the details with the team. Is it just the one room?",
      "Yes, the back bedroom. Sorry I missed your earlier message.",
      "No worries! We have Thursday, 11 AM–1 PM available for an inspection. Would that suit you?",
      "That works, let's book it.",
      "Booked for Thursday, 11 AM–1 PM. I've noted which room is affected for your technician.",
    ],
  },
];
const SOURCE_TOTALS: Record<Source, number> = {
  google_lsa: 52,
  meta: 38,
  thumbtack: 28,
  angi: 18,
  yelp: 12,
  website: 0,
};
const FIRST_NAMES = [
  "Cameron",
  "Dakota",
  "Emerson",
  "Finley",
  "Harper",
  "Jesse",
  "Kendall",
  "Logan",
  "Micah",
  "Noel",
  "Peyton",
  "Reese",
  "Rowan",
  "Skyler",
];
const LAST_NAMES = [
  "Adams",
  "Baker",
  "Cooper",
  "Dawson",
  "Evans",
  "Fisher",
  "Grant",
  "Hayes",
  "Irwin",
  "Jensen",
];
function allExamples(): Example[] {
  const examples = [...EXAMPLES];
  let sequence = 0;
  for (const [source, total] of Object.entries(SOURCE_TOTALS)) {
    const existing = EXAMPLES.filter((example) => example.source === source).length;
    for (let offset = existing; offset < total; offset++) {
      const template = EXAMPLES[sequence % EXAMPLES.length];
      const name = `${FIRST_NAMES[sequence % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(sequence / FIRST_NAMES.length)]}`;
      examples.push({
        ...template,
        name,
        source: source as Source,
        tags: template.tags.map((tag) => (tag === "Booked LSA" ? "Booked by Scout" : tag)),
        hours: 25 + ((sequence * 17) % 140),
        lines: template.lines.map((line) =>
          line.replaceAll(template.name.split(" ")[0], name.split(" ")[0]),
        ),
      });
      sequence++;
    }
  }
  return examples;
}
export function createDemoLeads(now: number): Lead[] {
  return allExamples().map((example, index) => {
    const receivedAt = now - example.hours * 3600000;
    const messages: Message[] = example.lines.map((text, i) => ({
      id: `${index}-${i}`,
      speaker: i % 2 === 0 ? "customer" : "scout",
      text,
      at: receivedAt + (i === 0 ? 0 : i === 1 ? (5 + (index % 4)) * 1000 : i * 65000),
      delivery: i % 2 ? (example.stage === "not_delivered" ? "failed" : "delivered") : undefined,
    }));
    return {
      id: `demo-lead-${index + 1}`,
      origin: "demo",
      name: example.name,
      phone: `+1${index < 10 ? "619" : index < 110 ? "202" : "303"}55501${String(index < 10 ? index : (index - 10) % 100).padStart(2, "0")}`,
      source: example.source,
      stage: example.stage,
      service: example.service,
      area: example.area,
      receivedAt,
      responseSeconds: example.stage === "not_delivered" ? null : 5 + (index % 4),
      qualified: example.stage !== "excused" && example.stage !== "not_delivered",
      bookedCents: example.value,
      tags: example.tags,
      reviewed: false,
      owner: "scout",
      messages,
      appointment: example.stage === "booked" ? "Confirmed · arrival window shared" : undefined,
    };
  });
}
