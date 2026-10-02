from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.text import Tokenizer
from tensorflow.keras.preprocessing.sequence import pad_sequences

from pydantic import BaseModel, Field

import numpy as np
import pickle
import re





# Model Path (BiGRU)
model_path = "Artifacts/BiGRU_model.keras"

# Tokenizer Path (BiGRU)
tokenizer_path = "Artifacts/tokenizer.pkl"

# Max Sequence Length (BiGRU)
max_sequence_length = 50


# Emotion Labels
emotion_labels = ['sadness', 'joy', 'love', 'anger', 'fear', 'surprise']
# Emotion Emoji 
emotion_emojis = {
    "anger":  "😠",
    "joy":  "​😀",
    "love":  "❤️",
    "sadness":  "😢",
    "fear":  "😨",
    "surprise":  "😮" 
    }


# Preprocess the upcoming text

def preprocess_text(text: str)-> str:
    text = text.lower()
    text = re.sub(r" ' ", "", text)
    text = re.sub(r"[^a-z 0-9\s]", " ",text)
    text= re.sub(r"\s=", " ", text).strip()
    return text
    




## Request and Response Schemas


class TextInput(BaseModel):
    text : str = Field(
        ..., 
        min_length = 1,
         max_length =2000,
         description = "The input text for emotion detection",
         json_schema_extra = {
             "example": "I am feeling very happy today!"}

    )



class PredictionResponse(BaseModel):
    text : str
    predicted_emotion: str
    confidence : float
    all_probabilities : dict[str, float]



class Health_Response(BaseModel):
    status : str
    model_loaded : bool



# Model Loading and LifeSpan Management

dl_model = {}


@asynccontextmanager

async def LifeSpan(app: FastAPI):
    print("Loading  yhe model and tokenizer...")
    dl_model["BiGRU"] = load_model(model_path)   # BiGRU Model
    with open(tokenizer_path ,"rb") as file:
        dl_model["Tokenizer"] = pickle.load(file)
    print("Model are loaded successfully...")


    yield # pause, model is loaded and server is running and at this point model wait for request 

    # model / server waiting for request 


    dl_model.clear()
    


# Mount the Static Files to the FastAPI 
app = FastAPI(
    lifespan= LifeSpan
)

app.add_middleware(
    CORSMiddleware ,
    allow_origins =["*"],
    allow_credentials = True,
    allow_methods = ["*"],
    allow_headers =["*"]

)

app.mount('/static' , StaticFiles(directory = 'static'),name = "static") 


# API Endpoints.



# A. server UI at  homepage('/)

@app.get('/', include_in_schema= False)
def server_ui():
    return FileResponse('static/index.html')


# B. Health Check Endpoint ('/health)

@app.get('/health', response_model= Health_Response)

def health_check ():
    return Health_Response(status = "\Server is running", model_loaded = bool(dl_model))


# Predication end point('/predict')

@app.post('/predict', response_model = PredictionResponse)
def predict_emotion(text_input : TextInput):


    
    BiGRU_model = dl_model.get("BiGRU")
    tokenizer_model = dl_model.get("Tokenizer")

    if BiGRU_model is None or tokenizer_model is None:
        raise HTTPException (status_code =503, detail = "Model is not loaded yet. Please try again later.")
    

    # clean text 
    cleaned_text = preprocess_text(text_input.text)


    #  convert text into num by tokenizer
    
    tokenized_text = tokenizer_model.texts_to_sequences([cleaned_text])

    padded_sequence = pad_sequences(
        tokenized_text,
        maxlen = max_sequence_length,
        padding="post",
        truncating = "post"
    )

    probabilities = BiGRU_model.predict(padded_sequence)[0]
    top_emotion_index = int(np.argmax(probabilities))
    all_probabilities = {
        label : float(prob)  for prob, label in zip (probabilities, emotion_labels ) 
    }


    return PredictionResponse(
    text=text_input.text,
    predicted_emotion=emotion_labels[top_emotion_index],
    confidence=float(probabilities[top_emotion_index]),
    all_probabilities=all_probabilities
)








# Serever run command
# uvicorn main:app --reload

    