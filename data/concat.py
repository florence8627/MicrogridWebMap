
import pandas as pd
import os


joined = None

for f in os.listdir('./data/daily'):
    name = f.split('.')[0].lower().replace(' ', '_')
    df = pd.read_csv(os.path.join('./data/daily', f))
    df = df.rename(columns=dict(kW=name))
    df['date'] = df['year'] * 10000 + df['month'] * 100 + df['day']

    df = df[['date', name]]
    print(name)
    if joined is None:
        joined = df
    else:
        joined = joined.merge(df, on='date', how='outer')
joined = joined.sort_values(by='date')

joined.to_csv('./data/daily.csv')