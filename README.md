# ProgrammersSolver

VS Code에서 프로그래머스 문제를 읽고 풀이 파일을 만들며, 샘플 테스트와 제출을 진행하는 확장입니다.

## 주요 기능

- 프로그래머스 문제 목록·난이도·상태·언어 필터
- 문제별 JavaScript, TypeScript, Python3, Java, C++ 풀이 파일 생성
- 샘플 입출력 로컬 실행
- 프로그래머스 전체 채점 제출
- 문제 설명과 테스트 결과를 사이드바에서 확인

## 요구 사항

- VS Code 1.95 이상
- 프로그래머스 계정
- 로컬 실행에 사용할 언어의 실행 환경
  - JavaScript: VS Code가 사용하는 Node.js
  - Python3: `python3`
  - Java: `javac`, `java`
  - C++: `g++` 또는 `clang++`

## 설치

1. `programmers-solver-0.1.1.vsix`를 받습니다.
2. VS Code 확장 탭에서 `...` → `Install from VSIX...`를 선택합니다.
3. VS Code를 다시 로드합니다.

명령줄에서는 다음을 실행합니다.

```bash
code --install-extension programmers-solver-0.1.1.vsix
```

## 시작하기

1. Chrome에서 프로그래머스에 로그인합니다.
2. `chrome-extension` 폴더를 `chrome://extensions`에서 압축해제 확장 프로그램으로 로드합니다.
3. Cookie Helper에서 `전체 쿠키 복사`를 누릅니다.
4. VS Code 명령 팔레트에서 `ProgrammersSolver: Set Session Cookie`를 실행하고 쿠키를 붙여넣습니다.
5. ProgrammersSolver 사이드바에서 새로고침한 뒤 문제를 선택합니다.

쿠키는 VS Code SecretStorage에 저장되며 화면이나 로그에 표시하지 않습니다.

## 사용법

문제를 선택하면 `problems/P_<문제ID>_<제목>/solution.<확장자>`에 풀이 파일이 생성됩니다.

- `Run Code`: 샘플 테스트 실행
- `Submit Code`: 프로그래머스 전체 채점 제출

## 주요 설정

- `programmers.filter.language`: 기본 언어 (`javascript`, `python3`, `java`, `cpp`)
- `programmers.useTypeScript`: JavaScript 대신 TypeScript 파일 생성
- `programmers.showSolvedProblems`: 해결한 문제 표시 여부
- `programmers.image.grayscale`, `programmers.image.opacity`, `programmers.image.hoverRestore`: 문제 설명 이미지 표시 방식
