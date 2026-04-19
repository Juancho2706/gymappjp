type OsakaScreenLabelProps = {
  num: string;
  title: string;
  jp: string;
  id?: string;
};

export function OsakaScreenLabel({ num, title, jp, id }: OsakaScreenLabelProps) {
  return (
    <div className="screen-label" id={id}>
      <span className="num">{num}</span>
      <span className="title">{title}</span>
      <span className="jp-sm" lang="ja">
        {jp}
      </span>
    </div>
  );
}
