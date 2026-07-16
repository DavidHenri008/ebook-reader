import styled from "@emotion/styled";
import { Button } from "../../components";
import type { DriveLibraryInfo } from "../../types";

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 2rem;
`;

const TitleContainer = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 12px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 2rem;
  font-weight: 300;
  color: var(--text-heading);
`;

const SubtleText = styled.p`
  margin: 0.25rem 0 0;
  color: var(--text);
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.75rem;
`;

const Account = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
`;

const Avatar = styled.img`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: var(--border);
`;

const AccountText = styled.div`
  min-width: 0;
  color: var(--text);
  font-size: 0.875rem;
`;

const AccountName = styled.div`
  color: var(--text-heading);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

interface HomeHeaderProps {
  libraryInfo: DriveLibraryInfo | null;
  user?: {
    name: string;
    email: string;
    picture?: string;
  } | null;
  onSignOut: () => void;
}

function HomeHeader({ libraryInfo, user, onSignOut }: HomeHeaderProps) {
  return (
    <Header>
      <TitleContainer>
        <Title>Epub Library</Title>
        <SubtleText>
          {libraryInfo?.folderName
            ? `Google Drive folder: ${libraryInfo.folderName}`
            : "Google Drive backed library"}
        </SubtleText>
      </TitleContainer>
      <HeaderActions>
        {user && (
          <Account>
            {user.picture && <Avatar src={user.picture} alt="" />}
            <AccountText>
              <AccountName>{user.name}</AccountName>
              <div>{user.email}</div>
            </AccountText>
          </Account>
        )}
        <Button type="button" onClick={onSignOut}>
          Sign out
        </Button>
      </HeaderActions>
    </Header>
  );
}

export default HomeHeader;
