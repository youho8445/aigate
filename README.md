# aigate

AI가 생성한 코드가 검증 없이 그대로 push되는 것을 막는 git `pre-push` 게이트 CLI.

- **v0.1**: `pre-push` 훅에서 typecheck/build를 실행하고, 실패하면 push를 차단한다.
- **v0.2**: push되는 커밋 범위의 diff를 프로젝트 루트의 `CLAUDE.md`(또는 지정한 규칙 파일) 내용과 대조해 Claude API로 검토한다. 위반이 있어도 **경고만 출력하고 push는 차단하지 않는다**.

## 설치

아직 npm 레지스트리에 게시되지 않았다. 소스에서 빌드해 tarball로 설치한다.

```sh
# 1) aigate 소스에서 빌드 + tarball 생성
git clone <this-repo>
cd aigate
npm install
npm run build
npm pack   # aigate-<version>.tgz 생성

# 2) 대상 레포에 devDependency로 설치
#    tarball을 대상 레포 안에 복사해두면(예: vendor/) CI/배포 환경에서도
#    상대 경로로 resolve된다. 레포 밖의 절대/상대 경로를 참조하면
#    다른 머신·빌드 서버에서 npm install이 깨진다.
cd /path/to/your-repo
mkdir -p vendor
cp /path/to/aigate/aigate-<version>.tgz vendor/
npm install --save-dev ./vendor/aigate-<version>.tgz
```

## 사용법

모든 명령은 대상 레포 루트(또는 그 하위 디렉터리)에서 실행한다. 레포 루트는 가장 가까운 상위 `.git` 디렉터리를 찾아 자동으로 판별한다.

### `aigate init`

레포 루트에 `aigate.config.json` 최소 템플릿을 생성한다. 이미 파일이 있으면 건드리지 않는다.

```sh
npx aigate init
```

### `aigate install`

`.git/hooks/pre-push`에 훅을 설치한다. 이미 다른 pre-push 훅이 있으면 `pre-push.aigate-backup`으로 백업한 뒤 설치한다. 이미 aigate가 설치돼 있으면(마커 주석으로 판별) 훅 내용을 새로 덮어써 갱신한다.

```sh
npx aigate install
```

### `aigate run`

실제 게이트 로직을 실행한다. `pre-push` 훅이 내부적으로 이 명령을 호출하며, 직접 실행해 로컬에서 미리 확인할 수도 있다.

```sh
npx aigate run
```

### `aigate uninstall`

설치된 훅을 제거한다. 백업이 있으면 원래 훅을 복원한다.

```sh
npx aigate uninstall
```

## 설정 파일 (`aigate.config.json`)

레포 루트에 두는 JSON 파일. 빌드 단위(모노레포면 여러 개)를 `targets` 배열로 정의한다.

```json
{
  "targets": [
    { "name": "backend", "cwd": ".", "typecheck": "npx tsc --noEmit", "build": "npm run build" },
    { "name": "frontend", "cwd": "frontend", "typecheck": "npx tsc --noEmit", "build": "npm run build" }
  ],
  "claudeReview": {
    "enabled": true,
    "rulesFile": "CLAUDE.md",
    "model": "claude-sonnet-5"
  }
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `targets[].name` | ✅ | 로그에 표시되는 이름 |
| `targets[].cwd` | ✅ | 레포 루트 기준 상대 경로. 루트 자체면 `"."` |
| `targets[].typecheck` | — | 생략하면 typecheck 단계 없이 build만 실행 |
| `targets[].build` | ✅ | 빌드 커맨드 |
| `claudeReview` | — | 생략하면 v0.2 단계 자체가 실행되지 않는다 (v0.1만 동작) |
| `claudeReview.enabled` | ✅ (섹션이 있으면) | `false`면 v0.2 스킵 |
| `claudeReview.rulesFile` | ✅ (섹션이 있으면) | 레포 루트 기준 규칙 파일 경로 (예: `CLAUDE.md`) |
| `claudeReview.model` | ✅ (섹션이 있으면) | 사용할 Claude 모델 ID |

## v0.2는 `ANTHROPIC_API_KEY`가 필요하다

`claudeReview`를 활성화했다면 환경변수 `ANTHROPIC_API_KEY`가 설정돼 있어야 한다. **키가 없으면 v0.2 단계는 경고 한 줄을 출력하고 조용히 스킵된다 — push를 막지 않는다.** API 호출 실패, diff가 너무 큰 경우(토큰 수 기준 가드 존재)도 마찬가지로 경고 후 스킵이며, v0.2는 어떤 경우에도 push를 차단하지 않도록 설계돼 있다.

## typecheck/build 커맨드는 직접 채워야 한다

`aigate init`이 생성하는 템플릿은 최소 예시 하나뿐이다. 모노레포거나 typecheck 커맨드가 `npx tsc --noEmit`이 아니라면 `aigate.config.json`을 직접 프로젝트에 맞게 수정해야 한다.

## 한계

- **로컬 게이트일 뿐, 서버사이드 강제가 아니다.** `git push --no-verify`를 쓰면 훅 자체가 실행되지 않으므로 아무 제약 없이 push된다. 이 CLI는 개발자가 실수로 깨진 코드나 규칙 위반을 push하는 것을 막기 위한 보조 장치이지, 우회를 원천 차단하는 장치가 아니다. 서버사이드로 강제하려면 별도로 CI에서 동일한 검증을 다시 돌려야 한다.
- v0.2의 CLAUDE.md 리뷰는 diff와 규칙 파일 텍스트를 기반으로 한 LLM 판단이며, 항상 정확하지는 않다 — 오탐(과도한 경고)과 미탐(구체적 위반을 놓치는 경우) 둘 다 발생할 수 있다.
- typecheck/build는 각 `targets` 항목마다 순차 실행되며, 레포 규모에 따라 push할 때마다 수 분이 걸릴 수 있다.

## 라이선스

MIT — [LICENSE](./LICENSE) 참고.
