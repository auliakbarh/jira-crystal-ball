import { useTranslation } from "react-i18next";

export default function Help() {
  const { t } = useTranslation();

  const SECTIONS: { title: string; items: string[] }[] = [
    {
      title: t("helpSections.gettingStartedTitle"),
      items: [
        t("helpSections.gettingStartedItem1"),
        t("helpSections.gettingStartedItem2"),
        t("helpSections.gettingStartedItem3"),
      ],
    },
    {
      title: t("helpSections.standupTitle"),
      items: [
        t("helpSections.standupItem1"),
        t("helpSections.standupItem2"),
        t("helpSections.standupItem3"),
        t("helpSections.standupItem4"),
        t("helpSections.standupItem5"),
        t("helpSections.standupItem6"),
        t("helpSections.standupItem7"),
      ],
    },
    {
      title: t("helpSections.panelsTitle"),
      items: [
        t("helpSections.panelsItem1"),
        t("helpSections.panelsItem2"),
        t("helpSections.panelsItem3"),
        t("helpSections.panelsItem4"),
        t("helpSections.panelsItem5"),
      ],
    },
    {
      title: t("helpSections.boardTitle"),
      items: [
        t("helpSections.boardItem1"),
        t("helpSections.boardItem2"),
      ],
    },
    {
      title: t("helpSections.clairvoyanceTitle"),
      items: [
        t("helpSections.clairvoyanceItem1"),
        t("helpSections.clairvoyanceItem2"),
        t("helpSections.clairvoyanceItem3"),
      ],
    },
    {
      title: t("helpSections.tarotTitle"),
      items: [
        t("helpSections.tarotItem1"),
        t("helpSections.tarotItem2"),
        t("helpSections.tarotItem3"),
        t("helpSections.tarotItem4"),
        t("helpSections.tarotItem5"),
        t("helpSections.tarotItem6"),
        t("helpSections.tarotItem7"),
        t("helpSections.tarotItem8"),
        t("helpSections.tarotItem9"),
        t("helpSections.tarotItem10"),
        t("helpSections.tarotItem11"),
      ],
    },
    {
      title: t("helpSections.previousSprintsTitle"),
      items: [
        t("helpSections.previousSprintsItem1"),
        t("helpSections.previousSprintsItem2"),
      ],
    },
    {
      title: t("helpSections.velocityTitle"),
      items: [
        t("helpSections.velocityItem1"),
        t("helpSections.velocityItem2"),
      ],
    },
    {
      title: t("helpSections.settingsTitle"),
      items: [
        t("helpSections.settingsItem1"),
        t("helpSections.settingsItem2"),
        t("helpSections.settingsItem3"),
        t("helpSections.settingsItem4"),
        t("helpSections.settingsItem5"),
        t("helpSections.settingsItem6"),
      ],
    },
  ];

  return (
    <div className="space-y-5">
      <div className="card">
        <h1 className="text-xl font-bold">{t("help.heading")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("help.subtitle")}</p>
      </div>

      {SECTIONS.map((s) => (
        <div key={s.title} className="card">
          <h2 className="mb-2 text-base font-bold">{s.title}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
            {s.items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
